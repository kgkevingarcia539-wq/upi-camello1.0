// --- API 1: Pregunta qué lugar corresponde a las coordenadas (OpenStreetMap) ---
export async function consultarLugarPorCoordenadas(
  lat: number,
  lon: number
): Promise<string> {
  const url = `https://openstreetmap.org{lat}&lon=${lon}&zoom=14&addressdetails=1`;

  const respuesta = await fetch(url, {
    headers: { 'User-Agent': 'upi-camello-app/1.0' },
    next: { revalidate: 86400 },
  });

  if (!respuesta.ok) return 'Zona rural de Barranca de Upía';

  const datos = await respuesta.json();
  return (
    datos.address?.village ||
    datos.address?.hamlet ||
    datos.address?.town ||
    datos.address?.city ||
    'Zona rural'
  );
}

// --- API 2: Clima actual + Pronóstico por horas + Pronóstico de 7 días ---
export interface DatosClimaCompleto {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

export async function consultarClimaAire(
  lat: number,
  lon: number
): Promise<DatosClimaCompleto> {
  const url = `https://open-meteo.com{lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America/Bogota&forecast_days=7`;

  const respuesta = await fetch(url, {
    next: { revalidate: 900 },
  });

  if (!respuesta.ok) {
    throw new Error('Error consultando clima');
  }

  return respuesta.json();
}

// --- API 3: Toma únicamente la humedad del suelo de esa coordenada ---
export interface DatosHumedadSuelo {
  valor: number;
  hora: string;
}

export async function consultarHumedadSuelo(
  lat: number,
  lon: number
): Promise<DatosHumedadSuelo> {
  const url = `https://open-meteo.com{lat}&longitude=${lon}&hourly=soil_moisture_3_to_9cm&timezone=America/Bogota&forecast_days=1`;

  const respuesta = await fetch(url, {
    next: { revalidate: 900 },
  });

  if (!respuesta.ok) {
    throw new Error('Error consultando humedad del suelo');
  }

  const datos = await respuesta.json();
  const horaColombia = new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
    .slice(0, 13)
    .replace(' ', 'T');
  const indice = datos.hourly.time.findIndex((t: string) =>
    t.startsWith(horaColombia)
  );
  const indiceValido = indice >= 0 ? indice : 0;

  return {
    valor: datos.hourly.soil_moisture_3_to_9cm[indiceValido] ?? 0,
    hora: datos.hourly.time[indiceValido] ?? '',
  };
}
