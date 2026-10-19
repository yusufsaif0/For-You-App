import * as Location from 'expo-location';

export interface LocalWeather {
  city: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  aqi: number | null;
  pm25: number | null;
}

const descriptions: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

interface ForecastResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

interface AirQualityResponse {
  current: {
    us_aqi?: number | null;
    pm2_5?: number | null;
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}. Please try again.`);
  return response.json() as Promise<T>;
}

export async function getLocalWeather(): Promise<LocalWeather> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission was not granted. Allow location access to see nearby weather and air quality.');

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = position.coords;
  const coordinates = `latitude=${latitude}&longitude=${longitude}&timezone=auto`;
  const [forecast, airQuality, places] = await Promise.all([
    getJson<ForecastResponse>(`https://api.open-meteo.com/v1/forecast?${coordinates}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`),
    getJson<AirQualityResponse>(`https://air-quality-api.open-meteo.com/v1/air-quality?${coordinates}&current=us_aqi,pm2_5`),
    Location.reverseGeocodeAsync({ latitude, longitude }).catch((error: unknown) => {
      console.warn('Unable to resolve the weather location name:', error);
      return [];
    }),
  ]);
  const place = places[0];
  const city = [place?.city, place?.region].filter(Boolean).join(', ') || 'Your location';

  return {
    city,
    temperature: forecast.current.temperature_2m,
    feelsLike: forecast.current.apparent_temperature,
    humidity: forecast.current.relative_humidity_2m,
    windSpeed: forecast.current.wind_speed_10m,
    description: descriptions[forecast.current.weather_code] ?? 'Current conditions',
    aqi: airQuality.current.us_aqi ?? null,
    pm25: airQuality.current.pm2_5 ?? null,
  };
}

export function aqiDescription(aqi: number | null) {
  if (aqi === null) return { label: 'Unavailable', color: '#788198' };
  if (aqi <= 50) return { label: 'Good', color: '#17A873' };
  if (aqi <= 100) return { label: 'Moderate', color: '#D6A126' };
  if (aqi <= 150) return { label: 'Sensitive groups', color: '#E1833B' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#E26A73' };
  if (aqi <= 300) return { label: 'Very unhealthy', color: '#A652B8' };
  return { label: 'Hazardous', color: '#8C2E48' };
}
