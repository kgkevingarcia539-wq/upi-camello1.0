
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  consultarLugarPorCoordenadas,
  consultarClimaAire,
  consultarHumedadSuelo,
} from '@/lib/clima';

export const dynamic = 'force-dynamic';

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

function esClimaLluvioso(p: number, c: number): boolean {
  return p > 0 || c >= 51;
}

function obtenerIconoClima(c: number): string {
  if (c === 0) return '☀️';
  if (c <= 3) return '⛅';
  if (c <= 48) return '☁️';
  if (c <= 67) return '🌧️';
  if (c <= 82) return '🌦️';
  return '⛈️';
}

function formatearHora(iso: string): string {
  const h = parseInt(iso.slice(11, 13), 10);
  if (h === 0) return '12 a.m.';
  if (h === 12) return '12 p.m.';
  return h > 12 ? `${h - 12} p.m.` : `${h} a.m.`;
}

function formatearDia(iso: string): string {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return dias[new Date(`${iso}T12:00:00`).getDay()];
}

export default async function PaginaPrincipal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return (
      <main className="p-6 text-center font-bold text-red-700">
        Faltan variables de Supabase en Vercel.
      </main>
    );
  }

  const supabase = createClient(url, key);
  const { data: veredasData } = await supabase.from('veredas').select('*');
  const { data: nivelesData } = await supabase.from('niveles_humedad').select('*');

  const veredas: Vereda[] = veredasData ?? [];
  const niveles: NivelHumedad[] = nivelesData ?? [];

  if (veredas.length === 0) {
    return (
      <main className="p-6 text-center font-bold text-red-700">
        No hay veredas cargadas.
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
        (n) => humedadSuelo.valor >= n.minimo && humedadSuelo.valor < n.maximo
      );

      const lloviendo = esClimaLluvioso(
        clima.current.precipitation,
        clima.current.weather_code
      );

            const horaActualIso = clima.current.time.slice(0, 13);
      const inicioHora = clima.hourly.time.findIndex((t) =>
        t.startsWith(horaActualIso)
      );


           const proximasHoras = [];
      for (
        let i = inicioHora;
        i < inicioHora + 24 && i < clima.hourly.time.length;
        i += 3
      ) {
        proximasHoras.push({
          hora: formatearHora(clima.hourly.time[i]),
          temp: Math.round(clima.hourly.temperature_2m[i]),
          prob: clima.hourly.precipitation_probability[i] ?? 0,
          icono: obtenerIconoClima(clima.hourly.weather_code[i]),
        });
      }

      const proximosDias = clima.daily.time.map((d, idx) => ({
        dia: formatearDia(d),
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

  const oscuro = listaVeredas[0]?.lloviendo ?? false;

  return (
    <div
      className={
        oscuro
          ? 'min-h-screen w-full overflow-x-hidden pb-24 bg-slate-950 text-slate-100'
          : 'min-h-screen w-full overflow-x-hidden pb-24 bg-sky-100 text-slate-900'
      }
    >
      <header
        className={
          oscuro
            ? 'px-4 py-4 bg-slate-900 text-white border-b border-slate-800 shadow-md'
            : 'px-4 py-4 bg-gradient-to-r from-blue-700 to-sky-600 text-white shadow-md'
        }
      >
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black">upi-camello</h1>
            <p className="text-xs sm:text-sm opacity-90">
              Clima y humedad de la tierra · Barranca de Upía
            </p>
          </div>
          <span className="text-3xl">{oscuro ? '🌧️' : '⛅'}</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4 space-y-5">
        {listaVeredas.map((item) => (
          <article
            key={item.vereda.id}
            className={
              item.lloviendo
                ? 'rounded-3xl p-4 sm:p-5 shadow-lg border bg-slate-900 border-slate-800 text-white'
                : 'rounded-3xl p-4 sm:p-5 shadow-lg border bg-gradient-to-b from-blue-600 to-sky-500 border-blue-400 text-white'
            }
          >
            <div className="flex justify-between items-start gap-2 pb-3">
              <div className="min-w-0 flex-1">
                <span className="inline-block text-xs font-bold uppercase px-2.5 py-0.5 rounded-full mb-1.5 bg-white/20">
                  {item.lloviendo ? '🌧️ Clima lluvioso' : '☀️ Tiempo seco'}
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold break-words">
                  {item.vereda.nombre}
                </h2>
                <p className="text-xs sm:text-sm opacity-90">
                  {item.vereda.municipio}
                </p>
                <p className="text-xs opacity-75 mt-1 break-words">
                  📍 {item.lugarDetectado} ({item.vereda.latitud},{' '}
                  {item.vereda.longitud})
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-4xl sm:text-5xl font-black">
                  {Math.round(item.clima.current.temperature_2m)}°
                </span>
                <p className="text-xs opacity-80 mt-1">
                  💧 {item.clima.current.precipitation} mm
                </p>
                <p className="text-xs opacity-80">
                  💨 {Math.round(item.clima.current.wind_speed_10m)} km/h
                </p>
              </div>
            </div>

            {item.semaforo ? (
              <div
                style={{ backgroundColor: item.semaforo.color }}
                className="text-white p-3.5 rounded-2xl mb-3 shadow-sm border border-white/15"
              >
                <p className="text-base sm:text-lg font-black uppercase">
                  Tierra {item.semaforo.nombre}
                </p>
                <p className="text-xs sm:text-sm mt-0.5">
                  {item.semaforo.mensaje}
                </p>
                <p className="text-xs opacity-90 mt-1.5">
                  Humedad estimada: {item.humedadSuelo.valor} m³/m³
                </p>
              </div>
            ) : (
              <div className="bg-black/20 p-3 rounded-xl mb-3 font-bold text-sm">
                Humedad del suelo: {item.humedadSuelo.valor} m³/m³
              </div>
            )}

            <div
              className={
                item.lloviendo
                  ? 'rounded-2xl p-3 mb-3 bg-slate-800/80'
                  : 'rounded-2xl p-3 mb-3 bg-blue-950/20'
              }
            >
              <p className="text-xs font-bold uppercase opacity-75 mb-2">
                Por horas
              </p>
              <div className="flex overflow-x-auto gap-3 pb-1 text-center">
                {item.proximasHoras.map((h, i) => (
                  <div
                    key={i}
                    className="shrink-0 w-12 flex flex-col items-center space-y-1"
                  >
                    <span className="text-xs opacity-80">{h.hora}</span>
                    <span className="text-xl">{h.icono}</span>
                    <span className="text-xs font-bold">{h.temp}°</span>
                    {h.prob > 0 && (
                      <span className="text-[11px] font-bold text-sky-300">
                        💧{h.prob}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div
              className={
                item.lloviendo
                  ? 'rounded-2xl p-3 bg-slate-800/80'
                  : 'rounded-2xl p-3 bg-blue-950/20'
              }
            >
              <div className="flex overflow-x-auto gap-2 text-center">
                {item.proximosDias.map((d, i) => (
                  <div
                    key={i}
                    className={
                      d.esHoy
                        ? 'shrink-0 w-14 py-2 px-1 rounded-xl flex flex-col items-center space-y-1 bg-white/25'
                        : 'shrink-0 w-14 py-2 px-1 rounded-xl flex flex-col items-center space-y-1'
                    }
                  >
                    <span className="text-xs font-semibold">{d.dia}</span>
                    <span className="text-xl">{d.icono}</span>
                    <div className="text-xs font-bold">
                      <span>{d.max}°</span>{' '}
                      <span className="opacity-65 font-normal">{d.min}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] opacity-75 mt-2.5">
              Estimación para la zona · Actualizado:{' '}
              {item.clima.current.time.replace('T', ' ')}
            </p>
          </article>
        ))}

        <footer className="text-center text-xs pt-2 opacity-75 space-y-1">
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
        className={
          oscuro
            ? 'fixed bottom-0 left-0 right-0 border-t p-2.5 shadow-lg bg-slate-950 border-slate-800 text-slate-200'
            : 'fixed bottom-0 left-0 right-0 border-t p-2.5 shadow-lg bg-white border-sky-200 text-slate-800'
        }
      >
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center font-bold text-sm">
          <Link href="/" className="py-2 rounded-xl text-white bg-blue-700">
            Veredas
          </Link>
          <Link href="/mi-finca" className="py-2 rounded-xl hover:bg-sky-500/10">
            Mi finca
          </Link>
          <Link href="/mapa" className="py-2 rounded-xl hover:bg-sky-500/10">
            Mapa
          </Link>
        </div>
      </nav>
    </div>
  );
}
