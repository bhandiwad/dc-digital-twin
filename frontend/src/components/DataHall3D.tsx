import React, { useMemo, useRef } from 'react';
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
  if (mode === 'inlet_temp') {
    const t = rack.inlet_temp_c;
    if (t >= 29.0) return '#ef4444';
    if (t >= 26.5) return '#f97316';
    if (t >= 24.0) return '#eab308';
    if (t >= 21.0) return '#10b981';
    return '#06b6d4';
  }
  if (mode === 'chip_temp') {
    const t = rack.chip_temp_c;
    if (t >= 76.0) return '#ef4444';
    if (t >= 69.0) return '#f97316';
    if (t >= 62.0) return '#eab308';
    if (t >= 54.0) return '#10b981';
    return '#3b82f6';
  }
  if (mode === 'power_kw') {
    const ratio = rack.power_kw / Math.max(rack.max_power_kw, 1);
    if (ratio >= 0.88) return '#ec4899';
    if (ratio >= 0.72) return '#a855f7';
    if (ratio >= 0.55) return '#6366f1';
    return '#3b82f6';
  }
  if (mode === 'anomaly') {
    const s = rack.anomaly_score;
    if (s >= 0.65) return '#ef4444';
    if (s >= 0.4) return '#f59e0b';
    return '#10b981';
  }
  return rack.cooling_type === 'hybrid_liquid' ? '#06b6d4' : '#64748b';
}

/**
 * Animated 3D CFD-Style Thermal Plume & Airflow Streamlines per Rack
 */
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
    return '#22d3ee';
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
        // Stream from front cold aisle (z + 1.1) through rack to hot exhaust (z - 0.9) and rising up
        child.position.z = 1.05 - phase * 1.95;
        child.position.y = 0.55 + phase * 2.25;
      });
    }
  });

  return (
    <group>
      {/* Translucent Rising Hot Exhaust Plume Cone above rear of rack */}
      <mesh ref={plumeRef} position={[0, 2.95, -0.35]}>
        <coneGeometry args={[0.55, 1.25, 16, 1, true]} />
        <meshBasicMaterial
          color={exhaustColor}
          transparent
          opacity={rack.status === 'critical' ? 0.36 : 0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Animated Airflow Streamline Spheres */}
      <group ref={particleRef}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.32, 1.0, 0.8]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial
              color={i === 2 ? exhaustColor : inletColor}
              transparent
              opacity={0.75}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/**
 * Animated Direct-to-Chip Liquid Coolant Pulses along Row C & D Overhead Manifolds
 */
const LiquidCoolantFlowPulses: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, idx) => {
        const isRowC = idx < 6;
        const slotIdx = idx % 6;
        const progress = (t * 0.45 + slotIdx / 6) % 1.0;
        // Flow from CDU at x = 11.5 across the row to x = -8.0
        mesh.position.x = 11.5 - progress * 19.5;
        mesh.position.z = isRowC ? 2.5 : 7.5;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }).map((_, idx) => (
        <mesh key={idx} position={[0, 2.45, idx < 6 ? 2.5 : 7.5]}>
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshBasicMaterial color="#22d3ee" />
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
}> = ({ rack, overlayMode, isSelected, onSelect, showPlumes }) => {
  const pulseRef = useRef<THREE.Mesh>(null);
  const heatColor = useMemo(() => getRackHeatColor(rack, overlayMode), [rack, overlayMode]);
  const powerRatio = Math.min(1, rack.power_kw / Math.max(rack.max_power_kw, 1));
  const isCritical = rack.status === 'critical' || rack.status === 'warning';

  useFrame(({ clock }) => {
    if (pulseRef.current && (isCritical || isSelected)) {
      const s = 1 + 0.06 * Math.sin(clock.getElapsedTime() * 5);
      pulseRef.current.scale.set(s, 1, s);
    }
  });

  const metricLabel = useMemo(() => {
    if (overlayMode === 'inlet_temp') return `${rack.inlet_temp_c.toFixed(1)}°C`;
    if (overlayMode === 'chip_temp') return `${rack.chip_temp_c.toFixed(0)}°C`;
    if (overlayMode === 'power_kw') return `${rack.power_kw.toFixed(0)}kW`;
    if (overlayMode === 'anomaly') return `${(rack.anomaly_score * 100).toFixed(0)}%`;
    return rack.cooling_type === 'hybrid_liquid' ? 'DLC' : 'AIR';
  }, [rack, overlayMode]);

  return (
    <group position={[rack.position.x, 0, rack.position.z]}>
      {(isSelected || isCritical) && (
        <mesh ref={pulseRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.18, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#22d3ee' : '#ef4444'}
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
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={isSelected ? '#1e293b' : '#0f172a'}
          metalness={0.75}
          roughness={0.28}
          emissive={heatColor}
          emissiveIntensity={isSelected ? 0.42 : 0.18}
        />
      </RoundedBox>

      {/* Front LED Thermal Strip */}
      <mesh position={[0, 1.18, 0.79]}>
        <planeGeometry args={[1.1, 2.1]} />
        <meshStandardMaterial
          color={heatColor}
          emissive={heatColor}
          emissiveIntensity={0.65}
          transparent
          opacity={0.78}
        />
      </mesh>

      {/* Power Pillar */}
      <mesh position={[0.48, 2.4 + powerRatio * 0.45, 0]}>
        <boxGeometry args={[0.18, Math.max(0.1, powerRatio * 0.9), 0.18]} />
        <meshStandardMaterial color={heatColor} emissive={heatColor} emissiveIntensity={0.9} />
      </mesh>

      {/* Direct-to-Chip Liquid Cooling Manifold Cap */}
      {rack.cooling_type === 'hybrid_liquid' && (
        <mesh position={[-0.35, 2.42, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.16, 16]} />
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.7} />
        </mesh>
      )}

      {/* 3D CFD Airflow Plumes & Streamlines */}
      {showPlumes && <RackAirflowPlume rack={rack} />}

      {/* Floating Telemetry Pill */}
      <Html position={[0, 2.85, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`cursor-pointer select-none px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border transition-all whitespace-nowrap shadow-lg ${
            isSelected
              ? 'bg-cyan-950/95 text-cyan-200 border-cyan-400 scale-110 ring-2 ring-cyan-400/40'
              : rack.status === 'critical'
              ? 'bg-red-950/95 text-red-200 border-red-500 animate-pulse'
              : rack.status === 'warning'
              ? 'bg-amber-950/90 text-amber-200 border-amber-500/80'
              : 'bg-slate-900/85 text-slate-200 border-slate-700/80 hover:border-cyan-500/60'
          }`}
        >
          <span className="opacity-70 mr-1">{rack.rack_id.replace('R-', '')}</span>
          <span>{metricLabel}</span>
        </div>
      </Html>
    </group>
  );
};

const CRACUnitMesh: React.FC<{
  crac: CRACTelemetry;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ crac, isSelected, onSelect }) => {
  const color = !crac.enabled ? '#ef4444' : isSelected ? '#22d3ee' : '#3b82f6';
  return (
    <group position={[crac.position.x, 0, crac.position.z]}>
      <RoundedBox
        args={[2.4, 2.5, 1.3]}
        radius={0.08}
        position={[0, 1.25, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color="#0f172a"
          metalness={0.6}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={0.32}
        />
      </RoundedBox>
      <Html position={[0, 2.95, 0]} center distanceFactor={25} zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap ${
            !crac.enabled
              ? 'bg-red-950/95 border-red-500 text-red-200 animate-bounce'
              : isSelected
              ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
              : 'bg-blue-950/90 border-blue-500/70 text-blue-200'
          }`}
        >
          {crac.crac_id}: {crac.enabled ? `${crac.supply_air_temp_c.toFixed(1)}°C (${crac.fan_speed_pct.toFixed(0)}%)` : 'FAULT / OFF'}
        </div>
      </Html>
    </group>
  );
};

const CDUUnitMesh: React.FC<{
  cdu: CDUTelemetry;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ cdu, isSelected, onSelect }) => {
  const color = cdu.status === 'critical' ? '#ef4444' : cdu.status === 'warning' ? '#f59e0b' : '#06b6d4';
  return (
    <group position={[cdu.position.x, 0, cdu.position.z]}>
      <RoundedBox
        args={[1.6, 2.4, 1.8]}
        radius={0.08}
        position={[0, 1.2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color="#083344"
          metalness={0.7}
          roughness={0.25}
          emissive={color}
          emissiveIntensity={isSelected ? 0.55 : 0.35}
        />
      </RoundedBox>
      <Html position={[0, 2.85, 0]} center distanceFactor={25} zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap ${
            cdu.status !== 'normal'
              ? 'bg-amber-950/95 border-amber-400 text-amber-200'
              : 'bg-cyan-950/90 border-cyan-400/80 text-cyan-200'
          }`}
        >
          💧 {cdu.cdu_id}: {cdu.supply_temp_c.toFixed(1)}°C | {cdu.total_flow_lpm.toFixed(0)} LPM
        </div>
      </Html>
    </group>
  );
};

const PDUUnitMesh: React.FC<{
  pdu: PDUTelemetry;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ pdu, isSelected, onSelect }) => {
  return (
    <group position={[pdu.position.x, 0, pdu.position.z]}>
      <RoundedBox
        args={[1.3, 2.2, 1.3]}
        radius={0.06}
        position={[0, 1.1, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color="#1e1b4b"
          metalness={0.65}
          roughness={0.35}
          emissive={isSelected ? '#a855f7' : '#6366f1'}
          emissiveIntensity={0.3}
        />
      </RoundedBox>
      <Html position={[0, 2.6, 0]} center distanceFactor={26} zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="cursor-pointer px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-950/90 border border-indigo-500/70 text-indigo-200 whitespace-nowrap"
        >
          ⚡ {pdu.pdu_id}: {pdu.current_load_kw.toFixed(0)}kW ({pdu.load_pct.toFixed(0)}%)
        </div>
      </Html>
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
  const bgColor = lightMode ? '#e2e8f0' : '#060a12';
  return (
    <div
      className={`relative w-full h-full ${
        lightMode
          ? 'bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200'
          : 'bg-gradient-to-b from-[#050811] via-[#09101f] to-[#060a12]'
      }`}
    >
      <Canvas camera={{ position: [0, 18.5, 22.5], fov: 44 }} shadows>
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[bgColor, 28, 58]} />

        <ambientLight intensity={lightMode ? 1.25 : 0.75} />
        <directionalLight position={[14, 24, 16]} intensity={lightMode ? 1.55 : 1.25} />
        <pointLight position={[-10, 10, -8]} intensity={0.6} color="#38bdf8" />
        <pointLight position={[10, 10, 8]} intensity={0.6} color="#22d3ee" />

        <Grid
          position={[0, 0.01, 0]}
          args={[32, 30]}
          cellSize={1}
          cellThickness={0.6}
          cellColor={lightMode ? '#94a3b8' : '#1e293b'}
          sectionSize={5}
          sectionThickness={1.2}
          sectionColor={lightMode ? '#0284c7' : '#0ea5e9'}
          fadeDistance={48}
          fadeStrength={1}
        />

        {/* Cold & Hot Aisle Floor Striping */}
        <mesh position={[0, 0.015, -5.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#0284c7" transparent opacity={0.12} />
        </mesh>
        <mesh position={[0, 0.015, 5.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.16} />
        </mesh>
        <mesh position={[0, 0.015, 0.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.5, 2.2]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.11} />
        </mesh>

        {/* Overhead Direct-to-Chip Liquid Cooling Piping & Power Busway Lines */}
        {showPipes && (
          <group>
            <Line
              points={[
                [11.5, 2.45, 2.5],
                [-8.0, 2.45, 2.5],
              ]}
              color="#06b6d4"
              lineWidth={3}
            />
            <Line
              points={[
                [11.5, 2.45, 7.5],
                [-8.0, 2.45, 7.5],
              ]}
              color="#22d3ee"
              lineWidth={3}
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
                lineWidth={1.5}
                dashed
                dashSize={0.4}
                gapSize={0.2}
              />
            ))}
          </group>
        )}

        {/* 32 Server Racks */}
        {snapshot.racks.map((rk) => (
          <RackMesh
            key={rk.rack_id}
            rack={rk}
            overlayMode={overlayMode}
            isSelected={selectedId === rk.rack_id}
            onSelect={() => onSelectComponent(rk.rack_id, 'rack')}
            showPlumes={showPlumes}
          />
        ))}

        {snapshot.cracs.map((crac) => (
          <CRACUnitMesh
            key={crac.crac_id}
            crac={crac}
            isSelected={selectedId === crac.crac_id}
            onSelect={() => onSelectComponent(crac.crac_id, 'crac')}
          />
        ))}

        {snapshot.cdus.map((cdu) => (
          <CDUUnitMesh
            key={cdu.cdu_id}
            cdu={cdu}
            isSelected={selectedId === cdu.cdu_id}
            onSelect={() => onSelectComponent(cdu.cdu_id, 'cdu')}
          />
        ))}

        {snapshot.pdus.map((pdu) => (
          <PDUUnitMesh
            key={pdu.pdu_id}
            pdu={pdu}
            isSelected={selectedId === pdu.pdu_id}
            onSelect={() => onSelectComponent(pdu.pdu_id, 'pdu')}
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
