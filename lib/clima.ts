
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

export interface DatosHumedadSuelo {
  valor: number;
  hora: string;
}

const validarCoordenadas = (lat: number, lon: number) => {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    throw new Error("Las coordenadas geográficas no son válidas.");
  }
};

// API 1: OpenStreetMap - identificar ubicación
export async function consultarLugarPorCoordenadas(
  lat: number,
  lon: number
): Promise<string> {
  validarCoordenadas(lat, lon);

  const parametros = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "14",
    addressdetails: "1",
  });

  const url = `https://nominatim.openstreetmap.org/reverse?${parametros}`;

  try {
    const respuesta = await fetch(url, {
      headers: {
        "User-Agent": "upi-camello-app/1.0 (weather application)",
        "Accept": "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (!respuesta.ok) {
      console.error("Error de Nominatim:", respuesta.status);
      return "Zona rural de Barranca de Upía";
    }

    const datos = await respuesta.json();
    const direccion = datos.address;

    return (
      direccion?.village ||
      direccion?.hamlet ||
      direccion?.town ||
      direccion?.city ||
      direccion?.municipality ||
      direccion?.county ||
      "Zona rural"
    );
  } catch (error) {
    console.error("Error consultando ubicación:", error);
    return "Zona rural de Barranca de Upía";
  }
}

// API 2: Open-Meteo - clima actual y pronóstico
export async function consultarClimaAire(
  lat: number,
  lon: number
): Promise<DatosClimaCompleto> {
  validarCoordenadas(lat, lon);

  const parametros = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    hourly:
      "temperature_2m,precipitation_probability,weather_code",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "America/Bogota",
    forecast_days: "7",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${parametros}`;

  const respuesta = await fetch(url, {
    next: { revalidate: 900 },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    console.error("Open-Meteo:", respuesta.status, detalle);
    throw new Error(
      `Open-Meteo respondió con el estado ${respuesta.status}`
    );
  }

  const datos = await respuesta.json();

  if (!datos.current || !datos.hourly || !datos.daily) {
    throw new Error("Open-Meteo devolvió datos incompletos.");
  }

  return datos as DatosClimaCompleto;
}

// API 3: Open-Meteo - humedad del suelo
export async function consultarHumedadSuelo(
  lat: number,
  lon: number
): Promise<DatosHumedadSuelo> {
  validarCoordenadas(lat, lon);

  const parametros = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "soil_moisture_3_to_9cm",
    timezone: "America/Bogota",
    forecast_days: "1",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${parametros}`;

  const respuesta = await fetch(url, {
    next: { revalidate: 900 },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    console.error("Error de humedad del suelo:", respuesta.status, detalle);
    throw new Error(
      `Error consultando humedad del suelo: ${respuesta.status}`
    );
  }

  const datos = await respuesta.json();

  const tiempos: string[] = datos.hourly?.time ?? [];
  const valores: (number | null)[] =
    datos.hourly?.soil_moisture_3_to_9cm ?? [];

  if (tiempos.length === 0 || valores.length === 0) {
    throw new Error("No hay datos disponibles de humedad del suelo.");
  }

  const horaColombia = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Bogota" })
    .slice(0, 13)
    .replace(" ", "T");

  let indice = tiempos.findIndex((hora) =>
    hora.startsWith(horaColombia)
  );

  if (indice < 0) {
    indice = 0;
  }

  const valor = valores[indice];

  if (valor === null || valor === undefined) {
    throw new Error("La humedad del suelo no está disponible para esta hora.");
  }

  return {
    valor,
    hora: tiempos[indice],
  };
}
