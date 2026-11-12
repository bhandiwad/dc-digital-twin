"""
Topology-Grounded GraphRAG Blast-Radius & Method of Procedure (MOP) Generator.
"""

from __future__ import annotations
from typing import List

from models import MOPDocumentResponse, MOPGenerationRequest, MOPStepItem
from simulator import DataHallTwinEngine


class GraphRAGMOPService:
    def generate_mop(self, engine: DataHallTwinEngine, req: MOPGenerationRequest) -> MOPDocumentResponse:
        comp_id = req.target_component_id
        downstream = engine.get_downstream_racks(comp_id)
        if not downstream:
            # Fallback to first configured row if an unknown ID was passed
            first_row = engine.site_config.rows[0].row_id
            downstream = engine.get_racks_for_rows([first_row])

        affected_racks: List[str] = [r.rack_id for r in downstream]
        affected_rows: List[str] = sorted({r.row_id for r in downstream})
        total_kw = round(sum(r.power_kw for r in downstream), 1)
        mop_id = f"MOP-{comp_id}-{int(engine.history[-1].timestamp) % 100000}"

        if comp_id in engine.cdus or comp_id.upper().startswith("CDU"):
            title = f"Online Secondary Strainer Swap & Bypass Switching on {comp_id}"
            risk = "MEDIUM-HIGH (High-Density Liquid AI Zone — Requires 15-Min Pre-Cooling)"
            sops = [
                "ASHRAE TC 9.9 Liquid Cooling Guidelines for Datacom Equipment (Class W2)",
                "CoolIT / Motivair CDU Redundant Pump & Duplex Strainer Switchover SOP-CDU-04",
                "Facility SLA Protection Standard: Zero Tenant Server Intervention Policy",
            ]
            zone_cracs = [c.crac_id for c in engine.cracs.values() if any(r in c.served_rows for r in affected_rows)]
            crac_hint = " & ".join(zone_cracs) if zone_cracs else "Zone CRACs"
            precool = {
                f"{comp_id}.supply_temp_setpoint_c": "21.0°C (-2.5°C Pre-Cool Buffer)",
                f"{comp_id}.pump_speed_pct": "94% (Max Redundant Flow Headroom)",
                f"{crac_hint}.fan_speed_pct": "88% (Boost Perimeter Air Capture)",
            }
        elif comp_id in engine.cracs or comp_id.upper().startswith("CRAC"):
            title = f"N+1 VFD Blower Inverter Replacement & Damper Isolation on {comp_id}"
            risk = "LOW-MEDIUM (N+1 Perimeter Air Redundancy Available)"
            sops = [
                "ASHRAE A1 Thermal Envelope Standard (18°C–27°C Cold Aisle)",
                "Vertiv LiebertCW / Schneider EcoStruxure VFD LOTO Procedure SOP-HVAC-12",
            ]
            precool = {
                "Peer CRAC Supply Setpoint": "16.8°C (-1.2°C Pre-Cool Cold Aisle)",
                "Peer CRAC VFD Fan Speed": "92% (Compensate Static Pressure Loss)",
            }
        else:
            title = f"Row PDU Infrared Thermography & Redundant Breaker Transfer on {comp_id}"
            risk = "MEDIUM (Dual-Corded A/B Power Feed Verification Required)"
            sops = [
                "NFPA 70E Electrical Safety in Critical Data Hall Environments",
                "Tier-III Concurrent Maintainability Switching SOP-EPMS-08",
            ]
            precool = {
                "Dual-Bus UPS Sync": "Verify Phase Angle < 1.5° Before Static Transfer",
                "Zone Cooling": "Maintain Nominal Cold-Aisle Setpoints",
            }

        first_precool_k, first_precool_v = next(iter(precool.items()))
        steps = [
            MOPStepItem(
                step_number=1,
                phase="PRE-CHECKS & PRE-COOLING",
                action=(
                    f"Verify NetworkX blast-radius telemetry across {len(affected_racks)} racks "
                    f"({affected_racks[0]}..{affected_racks[-1]}, {total_kw} kW total IT load). Confirm zero active critical alarms."
                ),
                verification_metric="Zone Inlet < 23.0°C and Return Coolant < 36.0°C",
                rollback_trigger="Abort if any rack in blast radius exceeds 25.5°C inlet prior to start.",
            ),
            MOPStepItem(
                step_number=2,
                phase="PRE-CHECKS & PRE-COOLING",
                action=(
                    f"Engage Aether-DCTWIN MPC Pre-Cooling profile for 15 minutes: set {first_precool_k} "
                    f"to {first_precool_v} to store thermal capacitance in the slab and coolant loop."
                ),
                verification_metric="Cold-plate / aisle thermal margin increases by +3.2°C",
                rollback_trigger="Chiller plant approach ΔT > 4.5°C.",
            ),
            MOPStepItem(
                step_number=3,
                phase="ISOLATION & LOTO",
                action=(
                    f"Switch {comp_id} from Lead-Lag Auto to Manual Lead on Standby Pump/Blower B. "
                    f"Slowly open duplex crossover valve V-{comp_id}-02 over 60 seconds to prevent hydraulic water hammer."
                ),
                verification_metric="Differential pressure transient < ±12 kPa",
                rollback_trigger="Manifold pressure drops below 135 kPa.",
            ),
            MOPStepItem(
                step_number=4,
                phase="EXECUTION",
                action=(
                    f"Isolate primary strainer/VFD chamber on {comp_id} and apply Lockout/Tagout (LOTO). "
                    f"Perform physical maintenance within the {req.duration_minutes}-minute window while monitoring 3D twin thermal plumes."
                ),
                verification_metric=f"Downstream racks ({', '.join(affected_racks[:3])}...) inlet < 26.5°C",
                rollback_trigger="Open bypass valve V-01 immediately if return temperature reaches 39.2°C.",
            ),
            MOPStepItem(
                step_number=5,
                phase="RESTORATION & VERIFICATION",
                action=(
                    f"Purge air from {comp_id} service chamber, remove LOTO, restore normal valve alignment, "
                    f"and re-enable Aether-DCTWIN AI Auto-Pilot closed-loop control."
                ),
                verification_metric="OpenDT RLS residual error < 0.4°C across all zones",
                rollback_trigger="Re-engage manual 90% pump override if ΔT oscillation occurs.",
            ),
        ]

        md_doc = f"""# METHOD OF PROCEDURE (MOP): `{mop_id}`
**Title:** {title}  
**Target Asset:** `{comp_id}` | **Window:** `{req.duration_minutes} Minutes` | **Risk Level:** `{risk}`  
**GraphRAG Blast Radius:** `{len(affected_racks)} Racks` (`{', '.join(affected_rows)}`: `{affected_racks[0]}..{affected_racks[-1]}`) | **Total Protected IT Load:** `{total_kw} kW`

---

## 1. Applicable Standards & Vendor SOPs
{chr(10).join(f"- {s}" for s in sops)}

## 2. Required Pre-Cooling & Redundancy Setpoints (T-15 Minutes)
{chr(10).join(f"- **{k}**: `{v}`" for k, v in precool.items())}

## 3. Step-by-Step Execution & Rollback Checklist
| Step | Phase | Operator Action | Verification Metric | Rollback Trigger |
| :---: | :--- | :--- | :--- | :--- |
""" + "\n".join(
            f"| **{s.step_number}** | `{s.phase}` | {s.action} | `{s.verification_metric}` | `{s.rollback_trigger}` |"
            for s in steps
        )

        return MOPDocumentResponse(
            mop_id=mop_id,
            title=title,
            target_component_id=comp_id,
            procedure_type=req.procedure_type,
            risk_classification=risk,
            blast_radius_rows=affected_rows,
            blast_radius_racks=affected_racks,
            total_affected_kw=total_kw,
            sop_references=sops,
            required_precool_setpoints=precool,
            steps=steps,
            markdown_document=md_doc,
        )
