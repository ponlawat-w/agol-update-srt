import { IAuthenticationManager, IFeature, IPoint, IPolyline, Position2D } from '@esri/arcgis-rest-request';
import { IEditFeatureResult, IFeatureSet, IUpdateFeaturesOptions, queryFeatures, updateFeatures } from '@esri/arcgis-rest-feature-service';
import { Feature, Point } from 'geojson';
import distance from '@turf/distance';

type StationDict = {[code: string]: Feature};

const STATIONS_URL = 'https://services5.arcgis.com/XDMGTTbkgKWI2WMY/arcgis/rest/services/สถานีและเส้นทางเดินรถ_รฟท/FeatureServer/6';
const LINES_URL = 'https://services5.arcgis.com/XDMGTTbkgKWI2WMY/arcgis/rest/services/สถานีและเส้นทางเดินรถ_รฟท/FeatureServer/20';

const getStations = async(auth: IAuthenticationManager|string): Promise<IFeatureSet> => {
  const url = STATIONS_URL;
  return (await queryFeatures({url: url, authentication: auth})) as IFeatureSet;
};

const getLines = async(auth: IAuthenticationManager|string): Promise<IFeatureSet> => {
  const url = LINES_URL;
  return (await queryFeatures({url: url, authentication: auth})) as IFeatureSet;
};

const stationFeatureSetToDictionary = (featureSet: IFeatureSet): StationDict => {
  const results: StationDict = {};
  for (const esriFeature of featureSet.features) {
    const code: string = esriFeature.attributes.code;
    const geometry: IPoint = esriFeature.geometry as IPoint;
    const feature: Feature = {
      type: 'Feature',
      properties: {...esriFeature.attributes},
      geometry: {
        type: 'Point',
        coordinates: [geometry.x, geometry.y]
      }
    };

    results[code] = feature;
  }
  return results;
};

const shouldReverse = (esriFeatureLine: IFeature, dict: StationDict): boolean => {
  const code1: string = esriFeatureLine.attributes.code1;
  const code2: string = esriFeatureLine.attributes.code2;
  if (!dict[code1]) {
    throw `${code1} not found`;
  }
  if (!dict[code2]) {
    throw `${code2} not found`;
  }
  const code1Geometry: Point = dict[code1].geometry as Point;
  const code2Geometry: Point = dict[code2].geometry as Point;
  const firstPosition: Position2D = (esriFeatureLine.geometry as IPolyline).paths[0][0] as Position2D;
  const firstCoordinate: Point = {type: 'Point', coordinates: firstPosition};

  const distanceFirstCoorToCode1 = distance(firstCoordinate, code1Geometry, { units: 'meters' });
  const distanceFirstCoorToCode2 = distance(firstCoordinate, code2Geometry, { units: 'meters' });

  return distanceFirstCoorToCode1 > distanceFirstCoorToCode2;
};

const reverse = (esriFeatureLine: IFeature): IFeature => {
  const geometry: IPolyline = esriFeatureLine.geometry as IPolyline;
  const newGeometry: IPolyline = {
    ...geometry,
    paths: geometry.paths.map(path => [...(path.map(position => position).reverse())])
  };
  return {
    ...esriFeatureLine,
    geometry: newGeometry
  };
};

const main = async() => {
  const token = process.argv[2];
  if (!token) {
    throw 'Invalid arguments';
  }

  const authentication = token;

  console.log('Getting stations...');
  const stations: IFeatureSet = await getStations(authentication);
  console.log(`${stations.features.length} feature(s) fetched.`);
  
  console.log('Getting lines...');
  const lines: IFeatureSet = await getLines(authentication);
  console.log(`${lines.features.length} feature(s) fetched.`);

  console.log('Getting station dictionary...');
  const dict: StationDict = stationFeatureSetToDictionary(stations);

  console.log('Reversing...');
  const updatedFeatures: IFeature[] = [];
  for (const esriLineFeature of lines.features) {
    const { code1, code2 } = esriLineFeature.attributes;
    if (shouldReverse(esriLineFeature, dict)) {
      console.log(`${code1} <-> ${code2} should reverse`);
      updatedFeatures.push(reverse(esriLineFeature));
    }
    console.log(`${code1} <-> ${code2} is correct`);
  }

  console.log(`Updating ${updatedFeatures.length} feature(s)...`);
  if (updatedFeatures.length) {
    const updateFeaturesOptions: IUpdateFeaturesOptions = {
      url: LINES_URL,
      features: updatedFeatures,
      authentication: authentication
    };
    const results: {updateResults: IEditFeatureResult[]} = await updateFeatures(updateFeaturesOptions);
    const success: number = results.updateResults.filter(x => x.success).length;
    const failed: number = results.updateResults.filter(x => !x.success).length;
    console.log(`${success} sucess, ${failed} failed`);
  }

  console.log('End');
};

main();
