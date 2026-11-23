
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración del municipio
const MUNICIPIO_OBJETIVO = 'barranca de upia';

// Veredas que no queremos mostrar
const VEREDAS_EXCLUIDAS = new Set([
  'guanapalo',
]);

interface PuntoMapa {
  id: string;
  titulo: string;
  subtitulo: string;
  latitud: number;
  longitud: number;
  tipo: 'vereda' | 'finca';
}

interface Registro {
  id: string | number;
  nombre?: string | null;
  cultivo?: string | null;
  municipio?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
}

// Normalizar nombres: elimina tildes, espacios extras y diferencias de mayúsculas.
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Validar coordenadas
function obtenerCoordenada(
  valor: number | string | null | undefined
): number | null {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }

  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

function coordenadasValidas(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// Calcular distancia entre dos ubicaciones
function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radio = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return radio * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

// Eliminar veredas repetidas
function eliminarVeredasDuplicadas(
  registros: Registro[]
): Registro[] {
  const veredasUnicas = new Map<string, Registro>();

  registros.forEach((vereda) => {
    if (!vereda.nombre || !vereda.municipio) {
      return;
    }

    const nombre = normalizarTexto(vereda.nombre);
    const municipio = normalizarTexto(vereda.municipio);

    // Solo Barranca de Upía
    if (municipio !== MUNICIPIO_OBJETIVO) {
      return;
    }

    // Excluir nombres no reconocidos
    if (VEREDAS_EXCLUIDAS.has(nombre)) {
      return;
    }

    const clave = `${municipio}-${nombre}`;

    // Si ya existe, no agregar otra vez
    if (!veredasUnicas.has(clave)) {
      veredasUnicas.set(clave, vereda);
    }
  });

  return Array.from(veredasUnicas.values());
}

export default function PaginaMapa() {
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [seleccionado, setSeleccionado] =
    useState<PuntoMapa | null>(null);

  const [miUbicacion, setMiUbicacion] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [estadoGps, setEstadoGps] = useState(
    '📡 Buscando tu ubicación GPS...'
  );

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Obtener ubicación GPS
  const ubicarme = useCallback(() => {
    if (!navigator.geolocation) {
      setEstadoGps('Tu navegador no permite utilizar GPS.');
      return;
    }

    setEstadoGps('📡 Solicitando permiso de ubicación...');

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const coordenadas = {
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
        };

        setMiUbicacion(coordenadas);
        setEstadoGps('✅ Ubicación GPS activa');

        setSeleccionado({
          id: 'gps-actual',
          titulo: 'Mi ubicación actual',
          subtitulo: 'Ubicación detectada por GPS',
          latitud: coordenadas.lat,
          longitud: coordenadas.lon,
          tipo: 'finca',
        });
      },
      (fallo) => {
        if (fallo.code === fallo.PERMISSION_DENIED) {
          setEstadoGps('⚠️ Permiso de ubicación denegado.');
        } else if (fallo.code === fallo.TIMEOUT) {
          setEstadoGps('⚠️ El GPS tardó demasiado.');
        } else {
          setEstadoGps('⚠️ No se pudo detectar tu ubicación.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  // Cargar ubicaciones desde Supabase
  useEffect(() => {
    let activo = true;

    async function cargarPuntos() {
      try {
        setCargando(true);
        setError('');

        const [
          { data: veredas, error: errorVeredas },
          { data: fincas, error: errorFincas },
        ] = await Promise.all([
          supabase.from('veredas').select('*'),
          supabase.from('fincas').select('*'),
        ]);

        if (errorVeredas) {
          throw new Error(
            `Error cargando veredas: ${errorVeredas.message}`
          );
        }

        if (errorFincas) {
          throw new Error(
            `Error cargando fincas: ${errorFincas.message}`
          );
        }

        const registrosFincas = (fincas ?? []) as Registro[];
        const registrosVeredas = (veredas ?? []) as Registro[];

        const lista: PuntoMapa[] = [];

        // Cargar fincas
        registrosFincas.forEach((finca) => {
          const lat = obtenerCoordenada(finca.latitud);
          const lon = obtenerCoordenada(finca.longitud);

          if (
            !finca.nombre ||
            lat === null ||
            lon === null ||
            !coordenadasValidas(lat, lon)
          ) {
            return;
          }

          lista.push({
            id: `f-${finca.id}`,
            titulo: finca.nombre.trim(),
            subtitulo: finca.cultivo
              ? `Mi finca · ${finca.cultivo}`
              : 'Mi finca',
            latitud: lat,
            longitud: lon,
            tipo: 'finca',
          });
        });

        // Limpiar y eliminar veredas duplicadas
        const veredasUnicas =
          eliminarVeredasDuplicadas(registrosVeredas);

        // Cargar solamente las veredas válidas
        veredasUnicas.forEach((vereda) => {
          const lat = obtenerCoordenada(vereda.latitud);
          const lon = obtenerCoordenada(vereda.longitud);

          if (
            !vereda.nombre ||
            lat === null ||
            lon === null ||
            !coordenadasValidas(lat, lon)
          ) {
            return;
          }

          lista.push({
            id: `v-${vereda.id}`,
            titulo: vereda.nombre.trim(),
            subtitulo: 'Barranca de Upía · Meta',
            latitud: lat,
            longitud: lon,
            tipo: 'vereda',
          });
        });

        if (activo) {
          setPuntos(lista);

          setSeleccionado((anterior) => {
            if (anterior?.id === 'gps-actual') {
              return anterior;
            }

            return lista[0] ?? null;
          });
        }
      } catch (fallo: unknown) {
        if (activo) {
          setError(
            fallo instanceof Error
              ? fallo.message
              : 'No se pudieron cargar las ubicaciones.'
          );
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargarPuntos();
    ubicarme();

    return () => {
      activo = false;
    };
  }, [ubicarme]);

  const latCentro = seleccionado?.latitud ?? 4.5697;
  const lonCentro = seleccionado?.longitud ?? -72.9667;

  const urlMapaGoogleEmbed =
    `https://maps.google.com/maps?q=${latCentro},${lonCentro}&z=15&output=embed`;

  const urlAbrirGoogleMaps =
    `https://www.google.com/maps/search/?api=1&query=${latCentro},${lonCentro}`;

  return (
    <div className="min-h-screen bg-sky-100 text-slate-900 pb-24">

      <header className="px-4 py-4 bg-gradient-to-r from-blue-700 to-sky-600 text-white shadow-md">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black">
              Mapa rural
            </h1>

            <p className="text-xs text-sky-100">
              Barranca de Upía · Meta, Colombia
            </p>
          </div>

          <button
            onClick={ubicarme}
            className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
          >
            📍 Mi GPS
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4 space-y-4">

        <div className="bg-white border border-sky-200 rounded-xl px-3 py-3 flex items-center justify-between gap-2 text-xs font-bold text-blue-950 shadow-sm">
          <span>{estadoGps}</span>

          {!miUbicacion && (
            <button
              onClick={ubicarme}
              className="bg-blue-700 text-white px-3 py-2 rounded-lg shrink-0 cursor-pointer"
            >
              Activar
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm">
            <p className="font-bold">
              Error al cargar los datos
            </p>
            <p>{error}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-sky-200">

          <div className="relative w-full h-72">
            <iframe
              title="Mapa de Barranca de Upía"
              src={urlMapaGoogleEmbed}
              className="w-full h-72 border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <div className="p-3">
            <a
              href={urlAbrirGoogleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold px-4 py-3 rounded-xl cursor-pointer"
            >
              🗺️ Abrir ubicación en Google Maps
            </a>
          </div>

          {seleccionado && (
            <div className="p-3 bg-blue-950 text-white text-xs">

              <p className="font-extrabold text-sm">
                {seleccionado.titulo}
              </p>

              <p className="opacity-80 mt-1">
                {seleccionado.subtitulo}
              </p>

              <p className="opacity-80 mt-1">
                {seleccionado.latitud.toFixed(5)},{' '}
                {seleccionado.longitud.toFixed(5)}
              </p>

              <a
                href={urlAbrirGoogleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg font-bold cursor-pointer"
              >
                Cómo llegar
              </a>
            </div>
          )}
        </div>

        <section className="space-y-3">

          <div className="flex justify-between items-center px-1">
            <h2 className="text-base font-extrabold text-blue-950">
              Ubicaciones rurales
            </h2>

            <span className="bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full">
              {puntos.length} lugares
            </span>
          </div>

          {cargando ? (
            <p className="text-center text-sm font-bold text-slate-600 py-6">
              Cargando ubicaciones...
            </p>
          ) : puntos.length === 0 ? (
            <div className="bg-white border border-sky-200 rounded-xl p-5 text-center">
              <p className="font-bold text-slate-700">
                No hay ubicaciones disponibles.
              </p>

              <p className="text-xs text-slate-500 mt-2">
                Comprueba los nombres, municipios y coordenadas
                registrados en Supabase.
              </p>
            </div>
          ) : (
            <div className="space-y-2">

              {puntos.map((punto) => {
                const activo = seleccionado?.id === punto.id;

                const distancia = miUbicacion
                  ? calcularDistanciaKm(
                      miUbicacion.lat,
                      miUbicacion.lon,
                      punto.latitud,
                      punto.longitud
                    ).toFixed(1)
                  : null;

                return (
                  <button
                    key={punto.id}
                    onClick={() => setSeleccionado(punto)}
                    className={
                      activo
                        ? 'w-full text-left p-3 rounded-xl border flex justify-between items-center bg-blue-700 text-white border-blue-800 shadow cursor-pointer'
                        : 'w-full text-left p-3 rounded-xl border flex justify-between items-center bg-white text-slate-800 border-sky-200 hover:bg-sky-50 cursor-pointer'
                    }
                  >

                    <div>
                      <span
                        className={
                          punto.tipo === 'finca'
                            ? 'inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mb-1 bg-emerald-100 text-emerald-800'
                            : 'inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mb-1 bg-sky-100 text-blue-800'
                        }
                      >
                        {punto.tipo === 'finca'
                          ? '🌱 Finca'
                          : '📍 Vereda'}
                      </span>

                      <p className="font-bold text-sm">
                        {punto.titulo}
                      </p>

                      <p className="text-xs opacity-75">
                        {punto.subtitulo}
                      </p>
                    </div>

                    {distancia !== null && (
                      <span className="text-xs font-extrabold shrink-0">
                        {distancia} km
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

          <Link
            href="/"
            className="py-2 rounded-xl hover:bg-sky-50"
          >
            Veredas
          </Link>

          <Link
            href="/mi-finca"
            className="py-2 rounded-xl hover:bg-sky-50"
          >
            Mi finca
          </Link>

          <Link
            href="/mapa"
            className="py-2 rounded-xl text-white bg-blue-700"
          >
            Mapa
          </Link>

        </div>
      </nav>

    </div>
  );
}
