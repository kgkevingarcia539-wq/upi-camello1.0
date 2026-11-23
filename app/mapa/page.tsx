'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_o34p68iXWI_iR8uZnudoxw_yrhDGCoa';

const supabase = createClient(supabaseUrl, supabaseKey);

interface PuntoMapa {
  id: string;
  titulo: string;
  subtitulo: string;
  latitud: number;
  longitud: number;
  tipo: 'vereda' | 'finca';
}

function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PaginaMapa() {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [seleccionado, setSeleccionado] = useState<PuntoMapa | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{ lat: number; lon: number } | null>(null);
  const [estadoGps, setEstadoGps] = useState<string>('📡 Buscando tu ubicación GPS...');
  const [cargando, setCargando] = useState(true);

  function ubicarme() {
    if (!navigator.geolocation) {
      setEstadoGps('Tu celular o navegador no soporta GPS.');
      return;
    }

    setEstadoGps('📡 Solicitando permiso de ubicación GPS...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMiUbicacion(coords);
        setEstadoGps('✅ Ubicación GPS activa (distancias calculadas)');
        setSeleccionado({
          id: 'gps-actual',
          titulo: 'Mi ubicación actual',
          subtitulo: 'GPS del celular',
          latitud: coords.lat,
          longitud: coords.lon,
          tipo: 'finca',
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setEstadoGps('⚠️ Ubicación bloqueada. Actívala en el ícono 🔒 de la barra de arriba.');
        } else {
          setEstadoGps('⚠️ No se pudo detectar el GPS. Toca "Activar" para reintentar.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    async function cargarPuntos() {
      try {
        const [{ data: veredas }, { data: fincas }] = await Promise.all([
          supabase.from('veredas').select('*'),
          supabase.from('fincas').select('*'),
        ]);

        const lista: PuntoMapa[] = [];

        (fincas ?? []).forEach((f: { id: number; nombre: string; cultivo?: string; latitud: number; longitud: number }) => {
          lista.push({
            id: 'f-' + f.id,
            titulo: f.nombre,
            subtitulo: f.cultivo ? 'Mi finca · ' + f.cultivo : 'Mi finca',
            latitud: f.latitud,
            longitud: f.longitud,
            tipo: 'finca',
          });
        });

        (veredas ?? []).forEach((v: { id: number; nombre: string; municipio: string; latitud: number; longitud: number }) => {
          lista.push({
            id: 'v-' + v.id,
            titulo: v.nombre,
            subtitulo: v.municipio,
            latitud: v.latitud,
            longitud: v.longitud,
            tipo: 'vereda',
          });
        });

        setPuntos(lista);
        if (lista.length > 0) {
          setSeleccionado((prev) => prev ?? lista[0]);
        }
      } finally {
        setCargando(false);
      }
    }

    cargarPuntos();
    ubicarme();
  }, []);

  const latCentro = seleccionado?.latitud ?? 4.5697;
  const lonCentro = seleccionado?.longitud ?? -72.9667;

  const urlMapaGoogleEmbed =
    'https://google.com' +
    latCentro +
    ',' +
    lonCentro +
    '&z=13&output=embed';

  const urlAbrirGoogleMaps =
    'https://google.com' +
    latCentro +
    ',' +
    lonCentro;

  return (
    <div className="min-h-screen bg-sky-100 text-slate-900 pb-24">
      <header className="px-4 py-4 bg-gradient-to-r from-blue-700 to-sky-600 text-white shadow-md">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black">Mapa rural</h1>
            <p className="text-xs text-sky-100">
              Barranca de Upía · Veredas y fincas
            </p>
          </div>
          <button
            onClick={ubicarme}
            className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-xs font-bold"
          >
            📍 Mi GPS
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4 space-y-4">
        <div className="bg-white border border-sky-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-blue-950 shadow-sm">
          <span>{estadoGps}</span>
          {!miUbicacion && (
            <button
              onClick={ubicarme}
              className="bg-blue-700 text-white px-3 py-1 rounded-lg shrink-0"
            >
              Activar
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-sky-200">
          <div className="relative w-full h-72">
            <iframe
              title="Mapa Google Barranca de Upía"
              src={urlMapaGoogleEmbed}
              className="w-full h-72 border-0"
              loading="lazy"
            />
            <a
              href={urlAbrirGoogleMaps}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir en Google Maps"
              className="absolute inset-0 z-10 flex items-end justify-end p-3 bg-transparent hover:bg-black/5 transition"
            >
              <span className="bg-white/95 text-blue-900 text-xs font-extrabold px-3 py-1.5 rounded-full shadow border border-sky-200">
                🗺️ Toca para abrir en Google Maps
              </span>
            </a>
          </div>

          {seleccionado && (
            <div className="p-3 bg-blue-950 text-white flex justify-between items-center text-xs">
              <div>
                <p className="font-extrabold text-sm">{seleccionado.titulo}</p>
                <p className="opacity-80">
                  {seleccionado.subtitulo} · {seleccionado.latitud.toFixed(4)},{' '}
                  {seleccionado.longitud.toFixed(4)}
                </p>
              </div>
              <a
                href={urlAbrirGoogleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-sky-500 text-white px-3 py-1.5 rounded-lg font-bold shrink-0"
              >
                Abrir GPS
              </a>
            </div>
          )}
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-extrabold text-blue-950 px-1">
            Toca un punto para verlo en el mapa
          </h2>

          {cargando ? (
            <p className="text-center text-sm font-bold text-slate-600 py-4">
              Cargando ubicaciones...
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
                        ? 'w-full text-left p-3 rounded-xl border transition flex justify-between items-center bg-blue-700 text-white border-blue-800 shadow'
                        : 'w-full text-left p-3 rounded-xl border transition flex justify-between items-center bg-white text-slate-800 border-sky-200 hover:bg-sky-50'
                    }
                  >
                    <div>
                      <span
                        className={
                          p.tipo === 'finca'
                            ? activo
                              ? 'inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1 bg-emerald-400 text-slate-950'
                              : 'inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1 bg-emerald-100 text-emerald-800'
                            : activo
                              ? 'inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1 bg-white/20 text-white'
                              : 'inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-1 bg-sky-100 text-blue-800'
                        }
                      >
                        {p.tipo === 'finca' ? '🌱 Mi finca' : '📍 Vereda'}
                      </span>
                      <p className="font-bold text-sm">{p.titulo}</p>
                      <p className="text-xs opacity-75">{p.subtitulo}</p>
                    </div>
                    {distancia && (
                      <span className="text-xs font-extrabold shrink-0">
                        a {distancia} km
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
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-sky-200 p-2.5 shadow-lg text-slate-800">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2 text-center font-bold text-sm">
          <Link href="/" className="py-2 rounded-xl hover:bg-sky-50">Veredas</Link>
          <Link href="/mi-finca" className="py-2 rounded-xl hover:bg-sky-50">Mi finca</Link>
          <Link href="/mapa" className="py-2 rounded-xl text-white bg-blue-700">Mapa</Link>
        </div>
      </nav>
    </div>
  );
}

