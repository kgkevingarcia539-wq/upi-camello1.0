
import { connection } from 'next/server';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { consultarDatosVereda } from '@/lib/clima';

interface Vereda {
  id: string | number;
  nombre: string;
  municipio: string;
  latitud: number | null;
  longitud: number | null;
}

interface NivelHumedad {
  nombre: string;
  minimo: number;
  maximo: number;
  color: string;
  mensaje: string;
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function obtenerCoordenada(
  fila: Record<string, unknown>,
  nombres: string[]
): number | null {
  for (const nombre of nombres) {
    const valor = Number(fila[nombre]);

    if (
      fila[nombre] !== null &&
      fila[nombre] !== undefined &&
      fila[nombre] !== '' &&
      Number.isFinite(valor)
    ) {
      return valor;
    }
  }

  return null;
}

function prepararVereda(fila: Record<string, unknown>): Vereda {
  return {
    id: String(fila.id ?? fila.nombre),
    nombre: String(fila.nombre ?? ''),
    municipio: String(fila.municipio ?? ''),
    latitud: obtenerCoordenada(fila, [
      'latitud',
      'latitude',
      'lat',
    ]),
    longitud: obtenerCoordenada(fila, [
      'longitud',
      'longitude',
      'lon',
      'lng',
    ]),
  };
}

function limpiarVeredas(veredas: Vereda[]) {
  const unicas = new Map<string, Vereda>();

  for (const vereda of veredas) {
    if (!vereda.nombre) continue;

    if (
      !normalizar(vereda.municipio).includes(
        'barranca de upia'
      )
    ) continue;

    const clave = normalizar(vereda.nombre);

    if (!unicas.has(clave)) {
      unicas.set(clave, vereda);
    }
  }

  // Las Moras aparece aunque todavía no esté registrada.
  // Necesita coordenadas reales en Supabase para consultar la API.
  if (!unicas.has('las moras')) {
    unicas.set('las moras', {
      id: 'las-moras-pendiente',
      nombre: 'Las Moras',
      municipio: 'Barranca de Upía, Meta',
      latitud: null,
      longitud: null,
    });
  }

  return [...unicas.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

function iconoClima(codigo: number) {
  if (codigo === 0) return '☀️';
  if (codigo <= 3) return '⛅';
  if (codigo <= 48) return '☁️';
  if (codigo <= 67) return '🌧️';
  if (codigo <= 77) return '❄️';
  if (codigo <= 82) return '🌦️';
  return '⛈️';
}

function obtenerNivel(
  humedad: number,
  niveles: NivelHumedad[]
) {
  const porcentaje = humedad * 100;

  return niveles.find(
    (nivel) =>
      porcentaje >= nivel.minimo &&
      porcentaje < nivel.maximo
  );
}

async function ContenidoVeredas() {
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return (
      <main className="p-8 text-center text-red-700">
        Faltan las variables de conexión de Supabase.
      </main>
    );
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('veredas')
    .select('*');

  if (error) {
    return (
      <main className="p-8 text-center text-red-700">
        Error consultando veredas: {error.message}
      </main>
    );
  }

  const { data: nivelesData } = await supabase
    .from('niveles_humedad')
    .select('*');

  const niveles = (nivelesData ?? []) as NivelHumedad[];

  const veredas = limpiarVeredas(
    (data ?? []).map((fila) =>
      prepararVereda(fila as Record<string, unknown>)
    )
  );

  const resultados = await Promise.all(
    veredas.map(async (vereda) => {
      if (
        vereda.latitud === null ||
        vereda.longitud === null ||
        vereda.latitud < -90 ||
        vereda.latitud > 90 ||
        vereda.longitud < -180 ||
        vereda.longitud > 180
      ) {
        return {
          vereda,
          clima: null,
          humedad: null,
          error: 'Faltan las coordenadas reales de esta vereda en Supabase.',
        };
      }

      try {
        const datos = await consultarDatosVereda(
          vereda.latitud,
          vereda.longitud
        );

        return {
          vereda,
          clima: datos.clima,
          humedad: datos.humedad,
          error: null,
        };
      } catch (e) {
        const mensaje =
          e instanceof Error ? e.message : String(e);

        console.error(
          `Error en ${vereda.nombre}:`,
          mensaje
        );

        return {
          vereda,
          clima: null,
          humedad: null,
          error: mensaje,
        };
      }
    })
  );

  const cantidadConClima = resultados.filter(
    (r) => r.clima !== null
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 pb-24">

      <header className="bg-gradient-to-r from-blue-950 to-blue-600 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-black">
            🌱 upi-camello
          </h1>
          <p className="mt-1 text-sm text-blue-100">
            Clima y humedad de las veredas
          </p>
          <p className="text-xs text-blue-200">
            Barranca de Upía · Meta · Colombia
          </p>
        </div>
      </header>

      <section className="max-w-6xl mx-auto p-4">

        <div className="grid grid-cols-2 gap-3 mb-6">

          <div className="bg-white rounded-2xl p-4 shadow">
            <p className="text-xs text-slate-500 font-bold">
              VEREDAS
            </p>
            <p className="text-3xl font-black text-blue-800">
              {veredas.length}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow">
            <p className="text-xs text-slate-500 font-bold">
              CONSULTAS EXITOSAS
            </p>
            <p className="text-3xl font-black text-green-700">
              {cantidadConClima}
            </p>
          </div>

        </div>

        <h2 className="text-2xl font-black text-slate-800 mb-4">
          📍 Clima por vereda
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {resultados.map((r) => {

            if (!r.clima || r.humedad === null) {
              return (
                <article
                  key={r.vereda.id}
                  className="bg-white rounded-2xl p-5 shadow border border-red-200"
                >
                  <h3 className="text-xl font-black text-slate-800">
                    📍 {r.vereda.nombre}
                  </h3>

                  <p className="text-xs text-slate-500 mt-1">
                    {r.vereda.municipio}
                  </p>

                  <div className="mt-4 bg-red-50 text-red-800 p-3 rounded-xl">
                    <p className="font-bold text-sm">
                      No se pudieron cargar los datos
                    </p>
                    <p className="text-xs mt-1 break-words">
                      {r.error}
                    </p>
                  </div>
                </article>
              );
            }

            const clima = r.clima;
            const porcentaje = Math.round(r.humedad * 100);

            const nivel = obtenerNivel(
              r.humedad,
              niveles
            );

            const codigo = clima.current.weather_code;

            return (
              <article
                key={r.vereda.id}
                className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200"
              >

                <div className="bg-gradient-to-r from-blue-800 to-sky-500 text-white p-5">

                  <div className="flex justify-between items-center">

                    <div>
                      <p className="text-xs uppercase font-bold text-blue-100">
                        Vereda
                      </p>

                      <h3 className="text-2xl font-black">
                        {r.vereda.nombre}
                      </h3>

                      <p className="text-xs text-blue-100">
                        {r.vereda.municipio}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-5xl">
                        {iconoClima(codigo)}
                      </p>

                      <p className="text-4xl font-black">
                        {Math.round(clima.current.temperature_2m)}°
                      </p>
                    </div>

                  </div>

                  <p className="text-xs mt-3 text-blue-100">
                    Humedad del aire: {clima.current.relative_humidity_2m}%
                  </p>

                </div>

                <div className="p-4">

                  <div className="grid grid-cols-2 gap-3">

                    <div className="bg-sky-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">
                        🌧️ Precipitación
                      </p>
                      <p className="text-xl font-black text-sky-800">
                        {clima.current.precipitation} mm
                      </p>
                    </div>

                    <div className="bg-sky-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">
                        💨 Viento
                      </p>
                      <p className="text-xl font-black text-sky-800">
                        {clima.current.wind_speed_10m} km/h
                      </p>
                    </div>

                  </div>

                  <div className="mt-4 border rounded-xl p-4">

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">
                          🌱 Humedad del suelo
                        </p>

                        <p className="text-3xl font-black text-blue-800">
                          {porcentaje}%
                        </p>
                      </div>

                      <span className="text-4xl">🌿</span>
                    </div>

                    <div className="w-full h-3 bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, porcentaje))}%`,
                          backgroundColor: nivel?.color || '#2563eb',
                        }}
                      />
                    </div>

                    {nivel ? (
                      <div
                        className="mt-3 p-3 rounded-xl text-white"
                        style={{
                          backgroundColor: nivel.color,
                        }}
                      >
                        <p className="font-black">
                          {nivel.nombre}
                        </p>
                        <p className="text-xs mt-1">
                          {nivel.mensaje}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mt-2">
                        Humedad del suelo consultada directamente a Open-Meteo.
                      </p>
                    )}

                  </div>

                  <div className="mt-5">

                    <h4 className="font-black text-slate-700 mb-3">
                      🕒 Pronóstico por horas
                    </h4>

                    <div className="flex gap-4 overflow-x-auto pb-3">

                      {clima.hourly.time
                        .slice(0, 24)
                        .filter((_: string, i: number) => i % 3 === 0)
                        .map((hora: string) => {
                          const i = clima.hourly.time.indexOf(hora);

                          return (
                            <div
                              key={hora}
                              className="min-w-14 text-center"
                            >
                              <p className="text-xs text-slate-500">
                                {hora.slice(11, 16)}
                              </p>

                              <p className="text-2xl my-1">
                                {iconoClima(clima.hourly.weather_code[i])}
                              </p>

                              <p className="font-bold text-slate-800">
                                {Math.round(clima.hourly.temperature_2m[i])}°
                              </p>

                              <p className="text-xs text-blue-600">
                                💧{clima.hourly.precipitation_probability[i] ?? 0}%
                              </p>
                            </div>
                          );
                        })}

                    </div>

                  </div>

                  <div className="mt-3">

                    <h4 className="font-black text-slate-700 mb-3">
                      📅 Próximos días
                    </h4>

                    <div className="grid grid-cols-5 gap-2">

                      {clima.daily.time.slice(0, 5).map(
                        (dia: string, i: number) => (
                          <div
                            key={dia}
                            className="bg-slate-50 rounded-xl p-2 text-center"
                          >
                            <p className="text-xs text-slate-500">
                              {new Date(`${dia}T12:00:00`).toLocaleDateString(
                                'es-CO',
                                { weekday: 'short' }
                              )}
                            </p>

                            <p className="text-xl">
                              {iconoClima(clima.daily.weather_code[i])}
                            </p>

                            <p className="text-sm font-black">
                              {Math.round(clima.daily.temperature_2m_max[i])}°
                            </p>

                            <p className="text-xs text-slate-500">
                              {Math.round(clima.daily.temperature_2m_min[i])}°
                            </p>
                          </div>
                        )
                      )}

                    </div>

                  </div>

                  <p className="text-[10px] text-slate-400 mt-4">
                    Fuente: Open-Meteo · {clima.current.time.replace('T', ' ')}
                  </p>

                </div>

              </article>
            );
          })}

        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          El clima y la humedad del suelo son estimaciones del modelo meteorológico.
        </p>

      </section>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center text-sm font-bold">

          <Link
            href="/"
            className="bg-blue-700 text-white rounded-xl p-3"
          >
            Veredas
          </Link>

          <Link
            href="/mi-finca"
            className="rounded-xl p-3 text-slate-700"
          >
            Mi finca
          </Link>

          <Link
            href="/mapa"
            className="rounded-xl p-3 text-slate-700"
          >
            Mapa
          </Link>

        </div>
      </nav>

    </main>
  );
}

export default function PaginaPrincipal() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-sky-100">
          <p className="text-xl font-black text-blue-800">
            🌱 Consultando las veredas...
          </p>
        </div>
      }
    >
      <ContenidoVeredas />
    </Suspense>
  );
}
