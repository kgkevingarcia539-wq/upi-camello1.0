import { connection } from 'next/server';

import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  consultarLugarPorCoordenadas,
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

function esClimaLluvioso(precipitacion: number, codigoClima: number): boolean {
  return precipitacion > 0 || codigoClima >= 51;
}

function obtenerIconoClima(codigo: number): string {
  if (codigo === 0) return '☀️';
  if (codigo <= 3) return '⛅';
  if (codigo <= 48) return '☁️';
  if (codigo <= 67) return '🌧️';
  if (codigo <= 82) return '🌦️';
  return '⛈️';
}

function formatearHora(fechaIso: string): string {
  const hora24 = parseInt(fechaIso.slice(11, 13), 10);
  if (hora24 === 0) return '12 a.m.';
  if (hora24 === 12) return '12 p.m.';
  return hora24 > 12 ? `${hora24 - 12} p.m.` : `${hora24} a.m.`;
}

function formatearDia(fechaIso: string): string {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fecha = new Date(`${fechaIso}T12:00:00`);
  return dias[fecha.getDay()];
}

async function ContenidoClima() {
  await connection();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yixyhbhwfirfuxmawxro.supabase.co/rest/v1/');
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_o34p68iXWI_iR8uZnudoxw_yrhDGCoa');

  if (!supabaseUrl || !supabaseKey) {
    return (
      <main className="p-6 text-center">
        <p className="text-lg font-bold text-red-700">
          Faltan configurar las variables de Supabase en Vercel.
        </p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: veredasData, error: veredasError } = await supabase.from('veredas').select('*');
  const { data: nivelesData } = await supabase.from('niveles_humedad').select('*');

  const veredas: Vereda[] = veredasData ?? [];
  const niveles: NivelHumedad[] = nivelesData ?? [];

  if (veredas.length === 0) {
    return (
      <main className="p-6 text-center">
        <p className="text-lg font-bold text-red-700">
          No se encontraron veredas. URL: {supabaseUrl} | Error: {veredasError?.message ?? 'ninguno (0 filas)'}
        </p>
      </main>
    );
  }

  const listaVeredas = await Promise.all(
    veredas.map(async (vereda) => {
      const [lugarDetectado, clima, humedadSuelo] = await Promise.all([
        consultarLugarPorCoordenadas(vereda.latitud, vereda.longitud),
        consultarClimaAire(vereda.latitud, vereda.longitud),
        consultarHumedadSuelo(vereda.latitud, vereda.longitud),
      ]);

      const semaforo = niveles.find(
        (nivel) =>
          humedadSuelo.valor >= nivel.minimo && humedadSuelo.valor < nivel.maximo
      );

      const lloviendo = esClimaLluvioso(
        clima.current.precipitation,
        clima.current.weather_code
      );

      const horaActualIso = clima.current.time.slice(0, 13);
      const inicioHora = clima.hourly.time.findIndex((t) =>
        t.startsWith(horaActualIso)
      );
      const indiceBase = inicioHora >= 0 ? inicioHora : 0;

      const proximasHoras = [];
      for (
        let i = indiceBase;
        i < indiceBase + 24 && i < clima.hourly.time.length;
        i += 3
      ) {
        proximasHoras.push({
          hora: formatearHora(clima.hourly.time[i]),
          temp: Math.round(clima.hourly.temperature_2m[i]),
          probLluvia: clima.hourly.precipitation_probability[i] ?? 0,
          icono: obtenerIconoClima(clima.hourly.weather_code[i]),
        });
      }

      const proximosDias = clima.daily.time.map((diaIso, idx) => ({
        dia: formatearDia(diaIso),
        icono: obtenerIconoClima(clima.daily.weather_code[idx]),
        max: Math.round(clima.daily.temperature_2m_max[idx]),
        min: Math.round(clima.daily.temperature_2m_min[idx]),
        esHoy: idx === 0,
      }));

      return {
        vereda,
        lugarDetectado,
        clima,
        humedadSuelo,
        semaforo,
        lloviendo,
        proximasHoras,
        proximosDias,
      };
    })
  );

  const hayLluviaGeneral = listaVeredas[0]?.lloviendo ?? false;
  return (
    <div
      className={`min-h-screen w-full overflow-x-hidden pb-24 transition-colors duration-500 ${
        hayLluviaGeneral
          ? 'bg-slate-950 text-slate-100'
          : 'bg-sky-100 text-slate-900'
      }`}
    >
      <header
        className={`px-4 py-4 sm:p-5 shadow-md transition-colors duration-500 ${
          hayLluviaGeneral
            ? 'bg-slate-900 text-white border-b border-slate-800'
            : 'bg-gradient-to-r from-blue-700 to-sky-600 text-white'
        }`}
      >
        <div className="max-w-lg mx-auto flex justify-between items-center gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              upi-camello
            </h1>
            <p
              className={`text-xs sm:text-sm mt-0.5 ${
                hayLluviaGeneral ? 'text-slate-400' : 'text-sky-100'
              }`}
            >
              Clima y humedad de la tierra · Barranca de Upía
            </p>
          </div>
          <span className="text-3xl sm:text-4xl shrink-0">
            {hayLluviaGeneral ? '🌧️' : '⛅'}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4 sm:p-4 space-y-5">
        {listaVeredas.map(
          ({
            vereda,
            lugarDetectado,
            clima,
            humedadSuelo,
            semaforo,
            lloviendo,
            proximasHoras,
            proximosDias,
          }) => (
            <article
              key={vereda.id}
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-lg border transition-colors ${
                lloviendo
                  ? 'bg-slate-900 border-slate-800 text-white'
                  : 'bg-gradient-to-b from-blue-600 to-sky-500 border-blue-400 text-white'
              }`}
            >
              <div className="flex justify-between items-start gap-2 pb-3 sm:pb-4">
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-block text-[11px] sm:text-xs font-bold uppercase px-2.5 py-0.5 rounded-full mb-1.5 ${
                      lloviendo
                        ? 'bg-slate-800 text-sky-400'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    {lloviendo ? '🌧️ Clima lluvioso' : '☀️ Tiempo seco'}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold break-words leading-tight">
                    {vereda.nombre}
                  </h2>
                  <p className="text-xs sm:text-sm opacity-90">
                    {vereda.municipio}
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-75 mt-1 break-words">
                    📍 {lugarDetectado} ({vereda.latitud}, {vereda.longitud})
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-4xl sm:text-5xl font-black leading-none">
                    {Math.round(clima.current.temperature_2m)}°
                  </span>
                  <p className="text-[11px] sm:text-xs opacity-80 mt-1.5">
                    💧 {clima.current.precipitation} mm
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-80">
                    💨 {Math.round(clima.current.wind_speed_10m)} km/h
                  </p>
                </div>
              </div>

              {semaforo ? (
                <div
                  style={{ backgroundColor: semaforo.color }}
                  className="text-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl mb-3 sm:mb-4 shadow-sm border border-white/15"
                >
                  <p className="text-base sm:text-lg font-black uppercase tracking-wide">
                    Tierra {semaforo.nombre}
                  </p>
                  <p className="text-xs sm:text-sm font-medium mt-0.5 leading-snug">
                    {semaforo.mensaje}
                  </p>
                  <p className="text-[11px] sm:text-xs opacity-90 mt-1.5">
                    Humedad estimada: {humedadSuelo.valor} m³/m³
                  </p>
                </div>
              ) : (
                <div className="bg-black/20 p-3 rounded-xl mb-3">
                  <p className="text-sm font-bold">
                    Humedad del suelo: {humedadSuelo.valor} m³/m³
                  </p>
                </div>
              )}

              <div
                className={`rounded-xl sm:rounded-2xl p-2.5 sm:p-3 mb-2.5 sm:mb-3 ${
                  lloviendo ? 'bg-slate-800/80' : 'bg-blue-950/20'
                }`}
              >
                <p className="text-[11px] sm:text-xs font-bold uppercase opacity-75 mb-2 px-1">
                  Por horas
                </p>
                <div className="flex overflow-x-auto gap-3 sm:gap-4 pb-1 text-center">
                  {proximasHoras.map((h, i) => (
                    <div
                      key={i}
                      className="shrink-0 w-12 sm:w-14 flex flex-col items-center space-y-1"
                    >
                      <span className="text-[11px] sm:text-xs opacity-80 font-medium">
                        {h.hora}
                      </span>
                      <span className="text-xl sm:text-2xl">{h.icono}</span>
                      <span className="text-xs sm:text-sm font-bold">
                        {h.temp}°
                      </span>
                      {h.probLluvia > 0 && (
                        <span className="text-[10px] sm:text-[11px] font-bold text-sky-300">
                          💧{h.probLluvia}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={`rounded-xl sm:rounded-2xl p-2.5 sm:p-3 ${
                  lloviendo ? 'bg-slate-800/80' : 'bg-blue-950/20'
                }`}
              >
                <div className="flex overflow-x-auto gap-1.5 sm:gap-2 text-center">
                  {proximosDias.map((d, i) => (
                    <div
                      key={i}
                      className={`shrink-0 w-14 sm:w-16 py-2 px-1 rounded-xl flex flex-col items-center space-y-1 ${
                        d.esHoy
                          ? lloviendo
                            ? 'bg-slate-700/90'
                            : 'bg-white/25'
                          : ''
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-semibold">
                        {d.dia}
                      </span>
                      <span className="text-xl sm:text-2xl">{d.icono}</span>
                      <div className="text-[11px] sm:text-xs font-bold">
                        <span>{d.max}°</span>{' '}
                        <span className="opacity-65 font-normal">{d.min}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] opacity-75 mt-2.5">
                Estimación para la zona · Actualizado:{' '}
                {clima.current.time.replace('T', ' ')}
              </p>
            </article>
          )
        )}

        <footer
          className={`text-center text-xs pt-2 space-y-1 ${
            hayLluviaGeneral ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          <p>
            Clima y suelo por{' '}
            <a
              href="https://open-meteo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
            >
              Open-Meteo.com
            </a>
          </p>
          <p>Ubicación por OpenStreetMap (Nominatim)</p>
        </footer>
      </main>

      <nav
        className={`fixed bottom-0 left-0 right-0 border-t p-2.5 sm:p-3 shadow-lg transition-colors ${
          hayLluviaGeneral
            ? 'bg-slate-950 border-slate-800 text-slate-200'
            : 'bg-white border-sky-200 text-slate-800'
        }`}
      >
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center font-bold text-sm sm:text-base">
          <Link
            href="/"
            className={`py-2 rounded-xl text-white ${
              hayLluviaGeneral ? 'bg-blue-600' : 'bg-blue-700'
            }`}
          >
            Veredas
          </Link>
          <Link
            href="/mi-finca"
            className={`py-2 rounded-xl ${
              hayLluviaGeneral ? 'hover:bg-slate-800' : 'hover:bg-sky-50'
            }`}
          >
            Mi finca
          </Link>
          <Link
            href="/mapa"
            className={`py-2 rounded-xl ${
              hayLluviaGeneral ? 'hover:bg-slate-800' : 'hover:bg-sky-50'
            }`}
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
        <div className="min-h-screen bg-sky-100 flex flex-col items-center justify-center p-6 text-center text-blue-900">
          <span className="text-5xl mb-3 animate-bounce">⛅</span>
          <p className="text-xl font-black">Cargando clima y tierra...</p>
          <p className="text-sm opacity-75 mt-1">Barranca de Upía</p>
        </div>
      }
    >
      <ContenidoClima />
    </Suspense>
  );
}



