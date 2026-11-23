
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://yixyhbhwfirfuxmawxro.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_o34p68iXWI_iR8uZnudoxw_yrhDGCoa'
);

interface PuntoMapa {
  id: string;
  titulo: string;
  subtitulo: string;
  latitud: number;
  longitud: number;
  tipo: 'vereda' | 'finca';
}

function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PaginaMapa() {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [seleccionado, setSeleccionado] =
    useState<PuntoMapa | null>(null);
  const [miUbicacion, setMiUbicacion] =
    useState<{ lat: number; lon: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargarPuntos() {
      try {
        const [resultadoVeredas, resultadoFincas] =
          await Promise.all([
            supabase.from('veredas').select('*'),
            supabase.from('fincas').select('*'),
          ]);

        if (resultadoVeredas.error) {
          throw resultadoVeredas.error;
        }

        if (resultadoFincas.error) {
          throw resultadoFincas.error;
        }

        const lista: PuntoMapa[] = [];
        const veredasUnicas = new Map<string, PuntoMapa>();

        (resultadoFincas.data ?? []).forEach((f) => {
          const lat = Number(f.latitud);
          const lon = Number(f.longitud);

          if (
            !f.nombre ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lon) ||
            lat < -90 ||
            lat > 90 ||
            lon < -180 ||
            lon > 180
          ) {
            return;
          }

          lista.push({
            id: `f-${f.id}`,
            titulo: f.nombre,
            subtitulo: f.cultivo
              ? `Mi finca · ${f.cultivo}`
              : 'Mi finca',
            latitud: lat,
            longitud: lon,
            tipo: 'finca',
          });
        });

        (resultadoVeredas.data ?? []).forEach((v) => {
          const nombre = String(v.nombre ?? '').trim();
          const municipio = String(v.municipio ?? '').trim();

          if (!nombre) return;

          // Ocultar Guanapalo
          if (nombre.toLowerCase() === 'guanapalo') return;

          const lat = Number(v.latitud);
          const lon = Number(v.longitud);

          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon) ||
            lat < -90 ||
            lat > 90 ||
            lon < -180 ||
            lon > 180
          ) {
            return;
          }

          // Evitar veredas repetidas
          const clave =
            `${nombre.toLowerCase()}-${municipio.toLowerCase()}`;

          if (!veredasUnicas.has(clave)) {
            veredasUnicas.set(clave, {
              id: `v-${v.id}`,
              titulo: nombre,
              subtitulo: municipio,
              latitud: lat,
              longitud: lon,
              tipo: 'vereda',
            });
          }
        });

        lista.push(...veredasUnicas.values());

        setPuntos(lista);

        if (lista.length > 0) {
          setSeleccionado(lista[0]);
        }
      } catch (err) {
        console.error('Error cargando ubicaciones:', err);
        setError('No se pudieron cargar las ubicaciones.');
      } finally {
        setCargando(false);
      }
    }

    cargarPuntos();
  }, []);

  function ubicarme() {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no permite utilizar GPS.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };

        setMiUbicacion(coords);

        setSeleccionado({
          id: 'gps-actual',
          titulo: 'Mi ubicación actual',
          subtitulo: 'GPS del dispositivo',
          latitud: coords.lat,
          longitud: coords.lon,
          tipo: 'finca',
        });
      },
      () => {
        setError('No se pudo obtener tu ubicación. Revisa el permiso del GPS.');
      }
    );
  }

  const latCentro = seleccionado?.latitud ?? 4.5697;
  const lonCentro = seleccionado?.longitud ?? -72.9667;

  const bbox = [
    lonCentro - 0.04,
    latCentro - 0.04,
    lonCentro + 0.04,
    latCentro + 0.04,
  ].join(',');

  const urlMapaOsm =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${latCentro},${lonCentro}`;

  const urlGoogleMaps =
    `https://www.google.com/maps/search/?api=1&query=${latCentro},${lonCentro}`;

  return (
    <div className="min-h-screen bg-sky-100 text-slate-900 pb-24">
      <header className="px-4 py-4 bg-gradient-to-r from-blue-700 to-sky-600 text-white shadow-md">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black">Mapa rural</h1>
            <p className="text-xs text-sky-100">
              Barranca de Upía · Meta, Colombia
            </p>
          </div>

          <button
            onClick={ubicarme}
            className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-xl text-xs font-bold"
          >
            📍 Mi GPS
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4 space-y-4">
        {error && (
          <div className="bg-red-100 text-red-800 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-sky-200">
          <iframe
            title="Mapa OpenStreetMap"
            src={urlMapaOsm}
            className="w-full h-72 border-0"
            loading="lazy"
          />

          {seleccionado && (
            <div className="p-3 bg-blue-950 text-white flex justify-between items-center gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-extrabold text-sm">
                  {seleccionado.titulo}
                </p>
                <p className="opacity-80 break-words">
                  {seleccionado.subtitulo}
                </p>
                <p className="opacity-70">
                  {seleccionado.latitud.toFixed(4)},{' '}
                  {seleccionado.longitud.toFixed(4)}
                </p>
              </div>

              <a
                href={urlGoogleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-sky-500 px-3 py-2 rounded-lg font-bold shrink-0"
              >
                Abrir mapa
              </a>
            </div>
          )}
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-extrabold text-blue-950 px-1">
            Veredas y fincas registradas
          </h2>

          {cargando ? (
            <p className="text-center text-sm font-bold py-4">
              Cargando ubicaciones...
            </p>
          ) : puntos.length === 0 ? (
            <p className="bg-white rounded-xl p-4 text-center text-sm">
              No hay ubicaciones disponibles.
            </p>
          ) : (
            <div className="space-y-2">
              {puntos.map((p) => {
                const activo = seleccionado?.id === p.id;

                const distancia = miUbicacion
                  ? calcularDistanciaKm(
                      miUbicacion.lat,
                      miUbicacion.lon,
                      p.latitud,
                      p.longitud
                    ).toFixed(1)
                  : null;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSeleccionado(p)}
                    className={
                      activo
                        ? 'w-full text-left p-3 rounded-xl border flex justify-between items-center bg-blue-700 text-white border-blue-800 shadow'
                        : 'w-full text-left p-3 rounded-xl border flex justify-between items-center bg-white text-slate-800 border-sky-200 hover:bg-sky-50'
                    }
                  >
                    <div>
                      <span
                        className={
                          p.tipo === 'finca'
                            ? 'inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mb-1 bg-emerald-100 text-emerald-800'
                            : 'inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mb-1 bg-sky-100 text-blue-800'
                        }
                      >
                        {p.tipo === 'finca' ? '🌱 Mi finca' : '📍 Vereda'}
                      </span>

                      <p className="font-bold text-sm">{p.titulo}</p>
                      <p className="text-xs opacity-75">
                        {p.subtitulo}
                      </p>
                    </div>

                    {distancia && (
                      <span className="text-xs font-extrabold shrink-0">
                        A {distancia} km
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-sky-200 p-2.5 shadow-lg text-slate-800">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center font-bold text-sm">
          <Link href="/" className="py-2 rounded-xl hover:bg-sky-50">
            Veredas
          </Link>

          <Link
            href="/mi-finca"
            className="py-2 rounded-xl text-white bg-blue-700"
          >
            Mi finca
          </Link>

          <Link href="/mapa" className="py-2 rounded-xl hover:bg-sky-50">
            Mapa
          </Link>
        </div>
      </nav>
    </div>
  );
}
