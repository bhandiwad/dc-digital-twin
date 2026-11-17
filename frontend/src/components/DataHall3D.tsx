import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  TwinStateSnapshot,
  RackTelemetry,
  CRACTelemetry,
  CDUTelemetry,
  PDUTelemetry,
  OverlayMode,
} from '../types';

interface DataHall3DProps {
  snapshot: TwinStateSnapshot;
  overlayMode: OverlayMode;
  selectedId: string | null;
  onSelectComponent: (id: string, type: 'rack' | 'crac' | 'cdu' | 'pdu') => void;
  showPipes: boolean;
  showPlumes: boolean;
  lightMode?: boolean;
}

function getRackHeatColor(rack: RackTelemetry, mode: OverlayMode): string {
  if (rack.occupancy_status === 'dark_spare' && mode !== 'cooling_type') {
    return '#475569';
  }
  if (mode === 'inlet_temp') {
    const t = rack.inlet_temp_c;
    if (t >= 29.0) return '#ef4444';
    if (t >= 26.5) return '#f97316';
    if (t >= 24.0) return '#eab308';
    if (t >= 21.0) return '#10b981';
    return '#0ea5e9';
  }
  if (mode === 'chip_temp') {
    // Facility Demarcation Return Temp (Manifold Return °C or Hot-Aisle Exhaust °C)
    const ret = rack.coolant_return_temp_c ?? rack.outlet_temp_c;
    if (ret >= 39.0) return '#ef4444';
    if (ret >= 35.5) return '#f97316';
    if (ret >= 32.5) return '#eab308';
    if (ret >= 28.0) return '#10b981';
    return '#3b82f6';
  }
  if (mode === 'power_kw') {
    if (rack.occupancy_status === 'ghost_reservation') return '#0284c7';
    const ratio = rack.power_kw / Math.max(rack.max_power_kw, 1);
    if (ratio >= 0.78) return '#ec4899';
    if (ratio >= 0.62) return '#a855f7';
    if (ratio >= 0.45) return '#6366f1';
    return '#3b82f6';
  }
  if (mode === 'anomaly') {
    const s = rack.anomaly_score;
    if (s >= 0.65) return '#ef4444';
    if (s >= 0.4) return '#f59e0b';
    return '#10b981';
  }
  return rack.cooling_type === 'hybrid_liquid' ? '#0ea5e9' : '#64748b';
}

const RackAirflowPlume: React.FC<{ rack: RackTelemetry }> = ({ rack }) => {
  const plumeRef = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Group>(null);

  const exhaustColor = useMemo(() => {
    if (rack.outlet_temp_c >= 39.0 || rack.chip_temp_c >= 75.0) return '#ef4444';
    if (rack.outlet_temp_c >= 34.5) return '#f97316';
    return '#eab308';
  }, [rack.outlet_temp_c, rack.chip_temp_c]);

  const inletColor = useMemo(() => {
    if (rack.inlet_temp_c >= 27.0) return '#f59e0b';
    return '#38bdf8';
  }, [rack.inlet_temp_c]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (plumeRef.current) {
      plumeRef.current.position.y = 2.95 + 0.15 * Math.sin(t * 3.2 + rack.position.x);
      const scale = 0.92 + 0.12 * Math.cos(t * 2.5 + rack.position.z);
      plumeRef.current.scale.set(scale, 1.0, scale);
    }
    if (particleRef.current) {
      particleRef.current.children.forEach((child, idx) => {
        const phase = (t * 1.4 + idx * 0.33) % 1.0;
        child.position.z = 1.05 - phase * 1.95;
        child.position.y = 0.55 + phase * 2.25;
      });
    }
  });

  return (
    <group>
      <mesh ref={plumeRef} position={[0, 2.95, -0.35]}>
        <coneGeometry args={[0.55, 1.25, 16, 1, true]} />
        <meshBasicMaterial
          color={exhaustColor}
          transparent
          opacity={rack.status === 'critical' ? 0.34 : 0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <group ref={particleRef}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.32, 1.0, 0.8]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial
              color={i === 2 ? exhaustColor : inletColor}
              transparent
              opacity={0.7}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const LiquidCoolantFlowPulses: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, idx) => {
        const isRowC = idx < 6;
        const slotIdx = idx % 6;
        const progress = (t * 0.4 + slotIdx / 6) % 1.0;
        mesh.position.x = 11.5 - progress * 19.5;
        mesh.position.z = isRowC ? 2.5 : 7.5;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }).map((_, idx) => (
        <mesh key={idx} position={[0, 2.45, idx < 6 ? 2.5 : 7.5]}>
          <sphereGeometry args={[0.095, 12, 12]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      ))}
    </group>
  );
};

const RackMesh: React.FC<{
  rack: RackTelemetry;
  overlayMode: OverlayMode;
  isSelected: boolean;
  onSelect: () => void;
  showPlumes: boolean;
  lightMode: boolean;
}> = ({ rack, overlayMode, isSelected, onSelect, showPlumes, lightMode }) => {
  const [hovered, setHovered] = useState(false);
  const pulseRef = useRef<THREE.Mesh>(null);
  const heatColor = useMemo(() => getRackHeatColor(rack, overlayMode), [rack, overlayMode]);
  const powerRatio = Math.min(1, rack.power_kw / Math.max(rack.max_power_kw, 1));
  const isAlert = rack.status === 'critical' || rack.status === 'warning';
  const showLabel = isSelected || hovered || isAlert;

  useFrame(({ clock }) => {
    if (pulseRef.current && (isAlert || isSelected)) {
      const s = 1 + 0.05 * Math.sin(clock.getElapsedTime() * 4.5);
      pulseRef.current.scale.set(s, 1, s);
    }
  });

  const metricLabel = useMemo(() => {
    if (rack.occupancy_status === 'dark_spare') return 'Spare Bay';
    if (overlayMode === 'inlet_temp') return `${rack.inlet_temp_c.toFixed(1)}°C`;
    if (overlayMode === 'chip_temp')
      return `Ret ${(rack.coolant_return_temp_c ?? rack.outlet_temp_c).toFixed(1)}°C`;
    if (overlayMode === 'power_kw')
      return `${rack.power_kw.toFixed(0)}/${(rack.contracted_power_kw ?? rack.max_power_kw).toFixed(0)} kW`;
    if (overlayMode === 'anomaly') return `${(rack.anomaly_score * 100).toFixed(0)}%`;
    return `${rack.whip_phase || 'L1-L2'} · ${rack.cooling_type === 'hybrid_liquid' ? 'Liquid' : 'Air'}`;
  }, [rack, overlayMode]);

  return (
    <group position={[rack.position.x, 0, rack.position.z]}>
      {(isSelected || isAlert) && (
        <mesh ref={pulseRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.15, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#38bdf8' : '#ef4444'}
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <RoundedBox
        args={[1.35, 2.35, 1.55]}
        radius={0.05}
        smoothness={4}
        position={[0, 1.18, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={
            lightMode
              ? isSelected || hovered
                ? '#cbd5e1'
                : '#dde5ef'
              : isSelected || hovered
              ? '#1e293b'
              : '#0f172a'
          }
          metalness={lightMode ? 0.18 : 0.72}
          roughness={lightMode ? 0.52 : 0.3}
          emissive={heatColor}
          emissiveIntensity={
            lightMode
              ? isSelected
                ? 0.2
                : hovered
                ? 0.12
                : 0.04
              : isSelected
              ? 0.38
              : hovered
              ? 0.28
              : 0.14
          }
        />
      </RoundedBox>

      {/* Front LED Thermal Strip */}
      <mesh position={[0, 1.18, 0.79]}>
        <planeGeometry args={[1.08, 2.08]} />
        <meshStandardMaterial
          color={heatColor}
          emissive={heatColor}
          emissiveIntensity={0.55}
          transparent
          opacity={0.78}
        />
      </mesh>

      {/* Power Pillar */}
      <mesh position={[0.48, 2.4 + powerRatio * 0.4, 0]}>
        <boxGeometry args={[0.16, Math.max(0.08, powerRatio * 0.8), 0.16]} />
        <meshStandardMaterial color={heatColor} emissive={heatColor} emissiveIntensity={0.8} />
      </mesh>

      {/* Direct-to-Chip Liquid Cooling Manifold Cap */}
      {rack.cooling_type === 'hybrid_liquid' && (
        <mesh position={[-0.35, 2.42, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.15, 16]} />
          <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.65} />
        </mesh>
      )}

      {showPlumes && <RackAirflowPlume rack={rack} />}

      {showLabel && (
        <Html position={[0, 2.95, 0]} center distanceFactor={22} zIndexRange={[10, 0]}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`cursor-pointer select-none px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums border transition-all whitespace-nowrap shadow-lg ${
              isSelected
                ? 'bg-slate-900/95 text-white border-sky-400 ring-2 ring-sky-400/30'
                : rack.status === 'critical'
                ? 'bg-red-950/95 text-red-100 border-red-400'
                : rack.status === 'warning'
                ? 'bg-amber-950/95 text-amber-100 border-amber-400'
                : 'bg-slate-900/95 text-slate-100 border-slate-600'
            }`}
          >
            <span className="font-semibold">{rack.rack_id}</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span>{metricLabel}</span>
          </div>
        </Html>
      )}
    </group>
  );
};

const CRACUnitMesh: React.FC<{
  crac: CRACTelemetry;
  isSelected: boolean;
  onSelect: () => void;
  lightMode: boolean;
}> = ({ crac, isSelected, onSelect, lightMode }) => {
  const [hovered, setHovered] = useState(false);
  const color = !crac.enabled ? '#ef4444' : isSelected ? '#38bdf8' : '#3b82f6';
  const showLabel = !crac.enabled || isSelected || hovered;

  return (
    <group position={[crac.position.x, 0, crac.position.z]}>
      <RoundedBox
        args={[2.4, 2.5, 1.3]}
        radius={0.08}
        position={[0, 1.25, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={lightMode ? (!crac.enabled ? '#fecaca' : '#bfdbfe') : '#0f172a'}
          metalness={lightMode ? 0.2 : 0.6}
          roughness={lightMode ? 0.5 : 0.32}
          emissive={color}
          emissiveIntensity={lightMode ? (isSelected || hovered ? 0.28 : 0.14) : isSelected || hovered ? 0.42 : 0.26}
        />
      </RoundedBox>
      {showLabel && (
        <Html position={[0, 2.95, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`cursor-pointer px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums border whitespace-nowrap shadow-lg ${
              !crac.enabled
                ? 'bg-red-950/95 border-red-400 text-red-100'
                : 'bg-slate-900/95 border-sky-400/70 text-slate-100'
            }`}
          >
            <span className="font-semibold">{crac.crac_id}</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span>
              {crac.enabled ? `${crac.supply_air_temp_c.toFixed(1)}°C` : 'Offline'}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
};

const CDUUnitMesh: React.FC<{
  cdu: CDUTelemetry;
  isSelected: boolean;
  onSelect: () => void;
  lightMode: boolean;
}> = ({ cdu, isSelected, onSelect, lightMode }) => {
  const [hovered, setHovered] = useState(false);
  const color =
    cdu.status === 'critical' ? '#ef4444' : cdu.status === 'warning' ? '#f59e0b' : '#0ea5e9';
  const showLabel = cdu.status !== 'normal' || isSelected || hovered;

  return (
    <group position={[cdu.position.x, 0, cdu.position.z]}>
      <RoundedBox
        args={[1.6, 2.4, 1.8]}
        radius={0.08}
        position={[0, 1.2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={lightMode ? '#bae6fd' : '#083344'}
          metalness={lightMode ? 0.22 : 0.68}
          roughness={lightMode ? 0.48 : 0.28}
          emissive={color}
          emissiveIntensity={lightMode ? (isSelected || hovered ? 0.3 : 0.16) : isSelected || hovered ? 0.5 : 0.3}
        />
      </RoundedBox>
      {showLabel && (
        <Html position={[0, 2.85, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`cursor-pointer px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums border whitespace-nowrap shadow-lg ${
              cdu.status !== 'normal'
                ? 'bg-amber-950/95 border-amber-400 text-amber-100'
                : 'bg-slate-900/95 border-sky-400/70 text-slate-100'
            }`}
          >
            <span className="font-semibold">{cdu.cdu_id}</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span>
              {cdu.supply_temp_c.toFixed(1)}°C · {cdu.total_flow_lpm.toFixed(0)} LPM
            </span>
          </div>
        </Html>
      )}
    </group>
  );
};

const PDUUnitMesh: React.FC<{
  pdu: PDUTelemetry;
  isSelected: boolean;
  onSelect: () => void;
  lightMode: boolean;
}> = ({ pdu, isSelected, onSelect, lightMode }) => {
  const [hovered, setHovered] = useState(false);
  const showLabel = isSelected || hovered || pdu.load_pct >= 80;

  return (
    <group position={[pdu.position.x, 0, pdu.position.z]}>
      <RoundedBox
        args={[1.3, 2.2, 1.3]}
        radius={0.06}
        position={[0, 1.1, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={lightMode ? '#c7d2fe' : '#1e1b4b'}
          metalness={lightMode ? 0.2 : 0.65}
          roughness={lightMode ? 0.5 : 0.35}
          emissive={isSelected || hovered ? '#818cf8' : '#6366f1'}
          emissiveIntensity={lightMode ? (isSelected || hovered ? 0.28 : 0.14) : isSelected || hovered ? 0.42 : 0.25}
        />
      </RoundedBox>
      {showLabel && (
        <Html position={[0, 2.6, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="cursor-pointer px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums bg-slate-900/95 border border-indigo-400/70 text-slate-100 whitespace-nowrap shadow-lg"
          >
            <span className="font-semibold">{pdu.pdu_id}</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span>
              {pdu.current_load_kw.toFixed(0)} kW ({pdu.load_pct.toFixed(0)}%)
            </span>
          </div>
        </Html>
      )}
    </group>
  );
};

export const DataHall3D: React.FC<DataHall3DProps> = ({
  snapshot,
  overlayMode,
  selectedId,
  onSelectComponent,
  showPipes,
  showPlumes,
  lightMode = false,
}) => {
  const bgColor = lightMode ? '#f1f5f9' : '#090d16';
  return (
    <div
      className={`relative w-full h-full ${
        lightMode
          ? 'bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200'
          : 'bg-gradient-to-b from-[#080c15] via-[#0b1120] to-[#080c15]'
      }`}
    >
      <Canvas camera={{ position: [0, 17.5, 21.5], fov: 42 }} shadows>
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[bgColor, 30, 62]} />

        <ambientLight intensity={lightMode ? 1.3 : 0.8} />
        <directionalLight position={[14, 24, 16]} intensity={lightMode ? 1.55 : 1.25} />
        <pointLight position={[-10, 10, -8]} intensity={0.5} color="#38bdf8" />
        <pointLight position={[10, 10, 8]} intensity={0.5} color="#0ea5e9" />

        <Grid
          position={[0, 0.01, 0]}
          args={[32, 30]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={lightMode ? '#cbd5e1' : '#1e293b'}
          sectionSize={5}
          sectionThickness={1.0}
          sectionColor={lightMode ? '#94a3b8' : '#334155'}
          fadeDistance={48}
          fadeStrength={1}
        />

        {/* Subtle Cold & Hot Aisle Floor Striping */}
        <mesh position={[0, 0.015, -5.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#0284c7" transparent opacity={0.1} />
        </mesh>
        <mesh position={[0, 0.015, 5.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.13} />
        </mesh>
        <mesh position={[0, 0.015, 0.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.08} />
        </mesh>

        {/* Overhead Direct-to-Chip Liquid Cooling Piping & Power Busway Lines */}
        {showPipes && (
          <group>
            <Line
              points={[
                [11.5, 2.45, 2.5],
                [-8.0, 2.45, 2.5],
              ]}
              color="#0ea5e9"
              lineWidth={2.5}
            />
            <Line
              points={[
                [11.5, 2.45, 7.5],
                [-8.0, 2.45, 7.5],
              ]}
              color="#38bdf8"
              lineWidth={2.5}
            />
            <LiquidCoolantFlowPulses />
            {[-7.5, -2.5, 2.5, 7.5].map((z, idx) => (
              <Line
                key={idx}
                points={[
                  [-11.5, 2.38, z],
                  [8.0, 2.38, z],
                ]}
                color="#6366f1"
                lineWidth={1.2}
                dashed
                dashSize={0.4}
                gapSize={0.25}
              />
            ))}
          </group>
        )}

        {/* Server Racks */}
        {snapshot.racks.map((rk) => (
          <RackMesh
            key={rk.rack_id}
            rack={rk}
            overlayMode={overlayMode}
            isSelected={selectedId === rk.rack_id}
            onSelect={() => onSelectComponent(rk.rack_id, 'rack')}
            showPlumes={showPlumes}
            lightMode={lightMode}
          />
        ))}

        {snapshot.cracs.map((crac) => (
          <CRACUnitMesh
            key={crac.crac_id}
            crac={crac}
            isSelected={selectedId === crac.crac_id}
            onSelect={() => onSelectComponent(crac.crac_id, 'crac')}
            lightMode={lightMode}
          />
        ))}

        {snapshot.cdus.map((cdu) => (
          <CDUUnitMesh
            key={cdu.cdu_id}
            cdu={cdu}
            isSelected={selectedId === cdu.cdu_id}
            onSelect={() => onSelectComponent(cdu.cdu_id, 'cdu')}
            lightMode={lightMode}
          />
        ))}

        {snapshot.pdus.map((pdu) => (
          <PDUUnitMesh
            key={pdu.pdu_id}
            pdu={pdu}
            isSelected={selectedId === pdu.pdu_id}
            onSelect={() => onSelectComponent(pdu.pdu_id, 'pdu')}
            lightMode={lightMode}
          />
        ))}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={8}
          maxDistance={38}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>
    </div>
  );
};
