
import { connection } from 'next/server';
import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  consultarClimaAire,
  consultarHumedadSuelo,
} from '@/lib/clima';

interface Vereda {
  id: number;
  nombre: string;
  municipio: string;
  latitud: number;
  longitud: number;
}

interface NivelHumedad {
  id: number;
  nombre: string;
  minimo: number;
  maximo: number;
  color: string;
  mensaje: string;
}

const MUNICIPIO = 'barranca de upia';

const EXCLUIDAS = new Set([
  'guanapalo',
]);

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function limpiarVeredas(veredas: Vereda[]): Vereda[] {
  const unicas = new Map<string, Vereda>();

  veredas.forEach((v) => {
    if (!v.nombre || !v.municipio) return;

    const nombre = normalizar(v.nombre);
    const municipio = normalizar(v.municipio);

    if (!municipio.includes(MUNICIPIO)) return;
    if (EXCLUIDAS.has(nombre)) return;

    if (
      !Number.isFinite(Number(v.latitud)) ||
      !Number.isFinite(Number(v.longitud)) ||
      Number(v.latitud) < -90 ||
      Number(v.latitud) > 90 ||
      Number(v.longitud) < -180 ||
      Number(v.longitud) > 180
    ) return;

    const clave = `${municipio}-${nombre}`;

    if (!unicas.has(clave)) {
      unicas.set(clave, v);
    }
  });

  return [...unicas.values()];
}

function iconoClima(codigo: number): string {
  if (codigo === 0) return '☀️';
  if (codigo <= 3) return '⛅';
  if (codigo <= 48) return '☁️';
  if (codigo <= 67) return '🌧️';
  if (codigo <= 77) return '❄️';
  if (codigo <= 82) return '🌦️';
  return '⛈️';
}

function estadoLluvia(precipitacion: number, codigo: number) {
  return precipitacion > 0 ||
    (codigo >= 51 && codigo <= 67) ||
    (codigo >= 80 && codigo <= 82) ||
    codigo >= 95;
}

function humedadPorcentaje(valor: number): number {
  return Math.round(valor <= 1 ? valor * 100 : valor);
}

async function ContenidoVeredas() {
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return (
      <main className="p-6 text-center text-red-700">
        Configura las variables de Supabase.
      </main>
    );
  }

  const supabase = createClient(url, key);

  const [
    { data: datos, error },
    { data: niveles, error: errorNiveles },
  ] = await Promise.all([
    supabase.from('veredas').select('*'),
    supabase.from('niveles_humedad').select('*'),
  ]);

  if (error || errorNiveles) {
    return (
      <main className="p-6 text-center text-red-700 font-bold">
        Error de Supabase: {error?.message ?? errorNiveles?.message}
      </main>
    );
  }

  const veredas = limpiarVeredas((datos ?? []) as Vereda[]);
  const nivelesHumedad = (niveles ?? []) as NivelHumedad[];

  const resultados = await Promise.all(
    veredas.map(async (vereda) => {
      try {
        const [clima, suelo] = await Promise.all([
          consultarClimaAire(vereda.latitud, vereda.longitud),
          consultarHumedadSuelo(vereda.latitud, vereda.longitud),
        ]);

        const humedad = Number(suelo.valor);

        if (!Number.isFinite(humedad)) {
          throw new Error('Humedad no disponible');
        }

        const semaforo = nivelesHumedad.find(
          (n) =>
            humedad >= n.minimo &&
            humedad < n.maximo
        );

        const codigo = clima.current.weather_code;
        const lluvia = estadoLluvia(
          clima.current.precipitation,
          codigo
        );

        return {
          vereda,
          clima,
          humedad,
          semaforo,
          lluvia,
          error: null,
        };
      } catch (e) {
        console.error(`Error en ${vereda.nombre}:`, e);

        return {
          vereda,
          clima: null,
          humedad: null,
          semaforo: null,
          lluvia: false,
          error: 'No se pudo consultar el clima de esta vereda.',
        };
      }
    })
  );

  const hayLluvia = resultados.some(
    (r) => r.clima !== null && r.lluvia
  );

  return (
    <div className={`min-h-screen pb-24 ${
      hayLluvia
        ? 'bg-slate-950 text-white'
        : 'bg-sky-100 text-slate-900'
    }`}>

      <header className={`px-4 py-5 text-white shadow-lg ${
        hayLluvia
          ? 'bg-slate-900'
          : 'bg-gradient-to-r from-blue-800 to-sky-500'
      }`}>
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black">
              🌱 upi-camello
            </h1>
            <p className="text-sm opacity-80">
              Veredas · Clima y humedad del suelo
            </p>
            <p className="text-xs opacity-70 mt-1">
              Barranca de Upía · Meta, Colombia
            </p>
          </div>
          <span className="text-4xl">
            {hayLluvia ? '🌧️' : '☀️'}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-5 space-y-5">

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <p className="text-xs text-slate-500 font-bold">
              VEREDAS
            </p>
            <p className="text-2xl font-black text-blue-800">
              {veredas.length}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <p className="text-xs text-slate-500 font-bold">
              CON CLIMA
            </p>
            <p className="text-2xl font-black text-emerald-700">
              {resultados.filter(r => r.clima !== null).length}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-3 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-xs text-slate-500 font-bold">
              CON LLUVIA
            </p>
            <p className="text-2xl font-black text-sky-700">
              {resultados.filter(r => r.clima !== null && r.lluvia).length}
            </p>
          </div>

        </div>

        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black">
              📍 Clima por vereda
            </h2>
            <p className="text-xs opacity-70">
              Información meteorológica de cada zona
            </p>
          </div>
          <span className="text-xs font-bold bg-blue-700 text-white px-3 py-2 rounded-full">
            {veredas.length} lugares
          </span>
        </div>

        {resultados.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center">
            No hay veredas registradas para este municipio.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {resultados.map((r) => {

              if (r.error || !r.clima || r.humedad === null) {
                return (
                  <article
                    key={r.vereda.id}
                    className="bg-white rounded-2xl p-5 border border-red-200 shadow"
                  >
                    <h3 className="font-black text-lg">
                      📍 {r.vereda.nombre}
                    </h3>
                    <p className="text-sm text-red-600 mt-2">
                      {r.error}
                    </p>
                  </article>
                );
              }

              const clima = r.clima;
              const porcentaje = humedadPorcentaje(r.humedad);

              return (
                <article
                  key={r.vereda.id}
                  className={`rounded-2xl overflow-hidden shadow-lg border ${
                    r.lluvia
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-gradient-to-br from-blue-700 to-sky-500 border-blue-400 text-white'
                  }`}>

                  {/* Nombre y temperatura */}
                  <div className="p-4">

                    <div className="flex justify-between items-start gap-3">

                      <div>
                        <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-1 rounded-full">
                          {r.lluvia ? '🌧️ Lluvioso' : '☀️ Tiempo seco'}
                        </span>

                        <h3 className="text-2xl font-black mt-3">
                          {r.vereda.nombre}
                        </h3>

                        <p className="text-xs opacity-80">
                          {r.vereda.municipio}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-5xl">
                          {iconoClima(clima.current.weather_code)}
                        </span>
                        <p className="text-4xl font-black mt-1">
                          {Math.round(clima.current.temperature_2m)}°
                        </p>
                      </div>

                    </div>

                    <p className="text-xs opacity-80 mt-3">
                      📍 {r.vereda.latitud}, {r.vereda.longitud}
                    </p>
                  </div>

                  {/* Datos meteorológicos */}
                  <div className="grid grid-cols-2 gap-2 px-4 pb-4">

                    <div className="bg-white/15 rounded-xl p-3">
                      <p className="text-xs opacity-75">
                        💧 Precipitación
                      </p>
                      <p className="text-xl font-black">
                        {clima.current.precipitation} mm
                      </p>
                    </div>

                    <div className="bg-white/15 rounded-xl p-3">
                      <p className="text-xs opacity-75">
                        💨 Viento
                      </p>
                      <p className="text-xl font-black">
                        {Math.round(clima.current.wind_speed_10m)} km/h
                      </p>
                    </div>

                  </div>

                  {/* Humedad del suelo */}
                  <div className="mx-4 mb-4 bg-white text-slate-900 rounded-xl p-4">

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
                          backgroundColor: r.semaforo?.color ?? '#2563eb',
                        }}
                      />
                    </div>

                    {r.semaforo ? (
                      <div
                        className="mt-3 rounded-xl p-3 text-white"
                        style={{ backgroundColor: r.semaforo.color }}
                      >
                        <p className="font-black uppercase text-sm">
                          Tierra {r.semaforo.nombre}
                        </p>
                        <p className="text-xs mt-1">
                          {r.semaforo.mensaje}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mt-2">
                        Sin clasificación de humedad configurada.
                      </p>
                    )}

                  </div>

                  {/* Pronóstico por horas */}
                  <div className="px-4 pb-4">

                    <p className="text-xs font-black uppercase mb-3 opacity-80">
                      Pronóstico por horas
                    </p>

                    <div className="flex gap-4 overflow-x-auto pb-2">

                      {(() => {
                        const horaActual = clima.current.time.slice(0, 13);
                        const inicio = clima.hourly.time.findIndex(
                          (t: string) => t.startsWith(horaActual)
                        );

                        const base = inicio >= 0 ? inicio : 0;

                        return Array.from(
                          { length: 8 },
                          (_, i) => base + i * 3
                        )
                          .filter(i => i < clima.hourly.time.length)
                          .map(i => (
                            <div
                              key={i}
                              className="shrink-0 text-center min-w-12"
                            >
                              <p className="text-[10px] opacity-75">
                                {clima.hourly.time[i].slice(11, 16)}
                              </p>

                              <p className="text-2xl my-1">
                                {iconoClima(clima.hourly.weather_code[i])}
                              </p>

                              <p className="text-sm font-black">
                                {Math.round(clima.hourly.temperature_2m[i])}°
                              </p>

                              <p className="text-[10px] text-sky-200">
                                💧{clima.hourly.precipitation_probability[i] ?? 0}%
                              </p>
                            </div>
                          ));
                      })()}

                    </div>
                  </div>

                  {/* Pronóstico semanal */}
                  <div className="px-4 pb-4">

                    <p className="text-xs font-black uppercase mb-3 opacity-80">
                      Próximos días
                    </p>

                    <div className="grid grid-cols-5 gap-1">

                      {clima.daily.time.slice(0, 5).map(
                        (dia: string, i: number) => (
                          <div
                            key={dia}
                            className="bg-white/15 rounded-xl p-2 text-center"
                          >
                            <p className="text-[10px] font-bold">
                              {new Date(`${dia}T12:00:00`).toLocaleDateString(
                                'es-CO',
                                { weekday: 'short' }
                              )}
                            </p>

                            <p className="text-xl my-1">
                              {iconoClima(clima.daily.weather_code[i])}
                            </p>

                            <p className="text-xs font-black">
                              {Math.round(clima.daily.temperature_2m_max[i])}°
                            </p>

                            <p className="text-[10px] opacity-70">
                              {Math.round(clima.daily.temperature_2m_min[i])}°
                            </p>
                          </div>
                        )
                      )}

                    </div>
                  </div>

                  <div className="bg-black/15 px-4 py-3 text-[10px] opacity-75">
                    Actualizado: {clima.current.time.replace('T', ' ')}
                  </div>

                </article>
              );
            })}

          </div>
        )}

        <footer className="text-center text-xs opacity-60 py-4">
          <p>Datos meteorológicos: Open-Meteo</p>
          <p>Humedad del suelo: estimación del servicio configurado</p>
          <p>upi-camello · Barranca de Upía, Meta</p>
        </footer>

      </main>

      <nav className={`fixed bottom-0 left-0 right-0 border-t p-3 shadow-lg ${
        hayLluvia
          ? 'bg-slate-950 border-slate-800 text-white'
          : 'bg-white border-sky-200 text-slate-800'
      }`}>
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center font-bold text-sm">

          <Link
            href="/"
            className="py-2 rounded-xl bg-blue-700 text-white"
          >
            Veredas
          </Link>

          <Link
            href="/mi-finca"
            className="py-2 rounded-xl hover:bg-sky-100"
          >
            Mi finca
          </Link>

          <Link
            href="/mapa"
            className="py-2 rounded-xl hover:bg-sky-100"
          >
            Mapa
          </Link>

        </div>
      </nav>

    </div>
  );
}

export default function PaginaPrincipal() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-sky-100 flex flex-col items-center justify-center text-blue-900">
          <span className="text-5xl animate-bounce">🌱</span>
          <h1 className="text-xl font-black mt-3">
            Cargando veredas...
          </h1>
          <p className="text-sm mt-1">
            Consultando clima y humedad
          </p>
        </div>
      }
    >
      <ContenidoVeredas />
    </Suspense>
  );
}
