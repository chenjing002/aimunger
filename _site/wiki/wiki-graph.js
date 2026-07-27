/*
 * aimunger Wiki — spatial concept map
 * React + @react-three/fiber + drei + gsap, no build step (ESM via importmap).
 * A sparse 3D knowledge graph on the left, a synchronized editorial detail panel on the right.
 * The core interaction is the focus shift: clicking a node reorganizes the whole interface around it.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import htm from 'htm';

const html = htm.bind(React.createElement);

/* ---------------------------------------------------------------- palette */
const C = {
  bg: '#ebe8e2',
  ink: '#26241f',
  inkSoft: '#6f6a60',
  person: '#2a2723',
  company: '#8b2500',
  faded: '#c4bfb5',
  halo: '#ffffff',
};

/* ---------------------------------------------------------------- helpers */
function nodeRadius(deg) {
  return Math.min(0.34 + (deg || 0) * 0.045, 1.05);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* quadratic bezier curve between two 3D points */
function computeCurve(a, b) {
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const dn = dir.clone().normalize();

  let seed = mid.lengthSq() > 0.01 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0);
  let perp = new THREE.Vector3().crossVectors(dn, seed);
  if (perp.lengthSq() < 0.001) perp.crossVectors(dn, new THREE.Vector3(0, 0, 1));
  if (perp.lengthSq() < 0.001) perp.set(1, 0, 0);
  perp.normalize();

  const ctrl = mid.clone().add(perp.multiplyScalar(len * 0.1));

  const segs = 16;
  const points = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const omt = 1 - t;
    points.push(new THREE.Vector3(
      omt * omt * a.x + 2 * omt * t * ctrl.x + t * t * b.x,
      omt * omt * a.y + 2 * omt * t * ctrl.y + t * t * b.y,
      omt * omt * a.z + 2 * omt * t * ctrl.z + t * t * b.z
    ));
  }
  return { points, ctrl };
}

/* ---------------------------------------------------------------- collision-aware force layout */
function computeLayout(nodes, edges, degree) {
  const rng = mulberry32(0x9e37);
  const pos = {};
  const vel = {};
  const ids = nodes.map((n) => n.id);

  const radii = {};
  ids.forEach((id) => { radii[id] = nodeRadius(degree[id] || 0); });

  ids.forEach((id) => {
    pos[id] = [(rng() * 2 - 1) * 6, (rng() * 2 - 1) * 6, (rng() * 2 - 1) * 4.5];
    vel[id] = [0, 0, 0];
  });
  const links = edges.map((e) => [e.source, e.target]);
  const REST = 3.2;

  for (let iter = 0; iter < 420; iter++) {
    const cool = 1 - iter / 460;

    for (let i = 0; i < ids.length; i++) {
      const a = pos[ids[i]];
      const ri = radii[ids[i]];
      const di = degree[ids[i]] || 0;
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos[ids[j]];
        const rj = radii[ids[j]];
        const dj = degree[ids[j]] || 0;
        let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        let d2 = dx * dx + dy * dy + dz * dz + 0.05;
        let d = Math.sqrt(d2);

        // Adaptive repulsion: high-degree nodes push harder
        const densityFactor = 1 + (di + dj) * 0.08;
        // Collision boost when closer than combined radii
        const minClearance = (ri + rj) * 2.8;
        const collisionBoost = d < minClearance ? (minClearance - d) * 0.35 : 0;

        const f = ((3.8 * densityFactor) / d2 + collisionBoost / d) * cool;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        vel[ids[i]][0] += ux * f; vel[ids[i]][1] += uy * f; vel[ids[i]][2] += uz * f;
        vel[ids[j]][0] -= ux * f; vel[ids[j]][1] -= uy * f; vel[ids[j]][2] -= uz * f;
      }
    }

    links.forEach(([s, t]) => {
      const a = pos[s], b = pos[t];
      if (!a || !b) return;
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const f = (d - REST) * 0.06 * cool;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      vel[s][0] += ux * f; vel[s][1] += uy * f; vel[s][2] += uz * f;
      vel[t][0] -= ux * f; vel[t][1] -= uy * f; vel[t][2] -= uz * f;
    });

    ids.forEach((id) => {
      const p = pos[id], v = vel[id];
      v[0] -= p[0] * 0.014; v[1] -= p[1] * 0.014; v[2] -= p[2] * 0.014;
      p[0] += v[0] * 0.85; p[1] += v[1] * 0.85; p[2] += v[2] * 0.85;
      v[0] *= 0.55; v[1] *= 0.55; v[2] *= 0.55;
    });
  }

  // Post-processing: collision resolution with node radii + label clearance
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < ids.length; i++) {
      const ri = radii[ids[i]];
      const labelClearance = 0.6;
      for (let j = i + 1; j < ids.length; j++) {
        const rj = radii[ids[j]];
        const a = pos[ids[i]], b = pos[ids[j]];
        let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const minDist = (ri + rj) * 2.2 + labelClearance * 2;
        if (d < minDist) {
          const push = (minDist - d) * 0.15;
          const ux = dx / d, uy = dy / d, uz = dz / d;
          a[0] += ux * push; a[1] += uy * push; a[2] += uz * push;
          b[0] -= ux * push; b[1] -= uy * push; b[2] -= uz * push;
        }
      }
    }
  }

  const out = {};
  ids.forEach((id) => { out[id] = new THREE.Vector3(pos[id][0], pos[id][1], pos[id][2]); });
  return out;
}

/* ---------------------------------------------------------------- expanded positions for focus selection */
function computeExpandedPositions(focusId, baseLayout, adj, degree) {
  if (!focusId || !baseLayout[focusId]) return baseLayout;

  const focusPos = baseLayout[focusId];
  const neighborIds = [...(adj[focusId] || [])];
  if (neighborIds.length === 0) return baseLayout;

  const result = {};
  for (const id in baseLayout) {
    result[id] = baseLayout[id].clone();
  }

  const neighborSet = new Set(neighborIds);

  // Compute angles of neighbors relative to focus in XY plane
  const neighborData = neighborIds.map(id => {
    const pos = result[id];
    const dx = pos.x - focusPos.x;
    const dy = pos.y - focusPos.y;
    return { id, angle: Math.atan2(dy, dx), dist: Math.sqrt(dx * dx + dy * dy), dz: pos.z - focusPos.z };
  });
  neighborData.sort((a, b) => a.angle - b.angle);

  // Ensure minimum angular spacing between neighbors
  const n = neighborData.length;
  if (n > 1) {
    const minSpacing = Math.min((2 * Math.PI) / Math.max(n, 1), Math.PI / 3);
    const adjusted = neighborData.map(d => d.angle);
    for (let pass = 0; pass < 20; pass++) {
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        let diff = adjusted[next] - adjusted[i];
        if (diff < 0) diff += 2 * Math.PI;
        if (diff < minSpacing) {
          const push = (minSpacing - diff) * 0.3;
          adjusted[i] -= push;
          adjusted[next] += push;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      neighborData[i].angle = adjusted[i];
    }
  }

  // Apply positions with minimum distance from focus
  const focusR = nodeRadius(degree[focusId] || 0);
  const minNeighborDist = 3.5 + focusR;

  neighborData.forEach((d) => {
    const dist = Math.max(d.dist, minNeighborDist);
    result[d.id] = new THREE.Vector3(
      focusPos.x + Math.cos(d.angle) * dist,
      focusPos.y + Math.sin(d.angle) * dist,
      focusPos.z + d.dz * 0.4
    );
  });

  // Resolve collisions between neighbors
  for (let pass = 0; pass < 15; pass++) {
    for (let i = 0; i < neighborIds.length; i++) {
      for (let j = i + 1; j < neighborIds.length; j++) {
        const a = result[neighborIds[i]], b = result[neighborIds[j]];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const ri = nodeRadius(degree[neighborIds[i]] || 0);
        const rj = nodeRadius(degree[neighborIds[j]] || 0);
        const clearance = (ri + rj) * 2.5 + 2.2;
        if (d < clearance) {
          const push = (clearance - d) * 0.25;
          const ux = dx / d, uy = dy / d, uz = dz / d;
          a.x += ux * push; a.y += uy * push; a.z += uz * push;
          b.x -= ux * push; b.y -= uy * push; b.z -= uz * push;
        }
      }
    }
  }

  // Push non-neighbors away from focus cluster
  for (const id in result) {
    if (id === focusId || neighborSet.has(id)) continue;
    const pos = result[id];
    const dx = pos.x - focusPos.x, dy = pos.y - focusPos.y, dz = pos.z - focusPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 7 && dist > 0.01) {
      const push = (7 - dist) * 0.12;
      pos.x += (dx / dist) * push;
      pos.y += (dy / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }

  return result;
}

/* ---------------------------------------------------------------- a single node — animated position, billboarded circle */
function NodeMesh({ node, targetPosition, radius, state, onClick, onOver, onOut }) {
  const mesh = useRef();
  const mat = useRef();
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  if (targetPosition) targetPos.current.copy(targetPosition);

  // Frozen initial position — R3F won't re-apply since reference never changes
  const [initPos] = useState(() => targetPosition ?
    [targetPosition.x, targetPosition.y, targetPosition.z] : [0, 0, 0]);

  const target = useMemo(() => {
    const baseColor = node.type === 'company' ? C.company : C.person;
    switch (state) {
      case 'focus': return { scale: 1.12, opacity: 1, color: baseColor };
      case 'neighbor': return { scale: 1.0, opacity: 0.85, color: baseColor };
      case 'hover': return { scale: 1.15, opacity: 1, color: baseColor };
      case 'dim': return { scale: 0.78, opacity: 0.15, color: C.faded };
      default: return { scale: 1, opacity: 0.92, color: baseColor };
    }
  }, [state, node.type]);

  const _c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    if (!mesh.current || !mat.current) return;
    mesh.current.position.lerp(targetPos.current, 0.07);
    mesh.current.quaternion.copy(camera.quaternion);
    const s = mesh.current.scale.x + (target.scale - mesh.current.scale.x) * 0.08;
    mesh.current.scale.setScalar(s);
    mat.current.opacity += (target.opacity - mat.current.opacity) * 0.08;
    _c.set(target.color);
    mat.current.color.lerp(_c, 0.08);
  });

  return html`
    <mesh
      ref=${mesh}
      position=${initPos}
      onClick=${(e) => { e.stopPropagation(); onClick(node.id); }}
      onPointerOver=${(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onOver(node.id); }}
      onPointerOut=${() => { document.body.style.cursor = 'default'; onOut(node.id); }}
    >
      <circleGeometry args=${[radius, 32]} />
      <meshBasicMaterial ref=${mat} transparent=${true} side=${THREE.DoubleSide} color=${target.color} />
    </mesh>
  `;
}

/* ---------------------------------------------------------------- animated label that follows its node */
/* Labels are clickable proxies for their node: click selects, hover highlights.
   (drei's Html wrapper always captures pointer events in non-transform mode,
   so making labels interactive beats having them silently swallow clicks.) */
function AnimatedLabel({ id, targetPosition, offset, cls, text, onPick, onOver, onOut }) {
  const groupRef = useRef();
  const targetPos = useRef(new THREE.Vector3());
  targetPos.current.set(targetPosition.x, targetPosition.y + offset, targetPosition.z);

  const [initPos] = useState(() =>
    [targetPosition.x, targetPosition.y + offset, targetPosition.z]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(targetPos.current, 0.08);
  });

  return html`
    <group ref=${groupRef} position=${initPos}>
      <${Html} center=${true} zIndexRange=${[10, 0]}>
        <div
          class=${cls}
          onClick=${(e) => { e.stopPropagation(); onPick(id); }}
          onPointerEnter=${() => onOver(id)}
          onPointerLeave=${() => onOut(id)}
        >${text}</div>
      <//>
    </group>
  `;
}

/* ---------------------------------------------------------------- restrained halo behind focus */
function Halo({ targetPosition, radius }) {
  const ref = useRef();
  const targetPos = useRef(new THREE.Vector3());
  if (targetPosition) targetPos.current.copy(targetPosition);
  const [initPos] = useState(() => targetPosition ?
    [targetPosition.x, targetPosition.y, targetPosition.z] : [0, 0, 0]);

  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.03)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.lerp(targetPos.current, 0.08);
    ref.current.material.opacity += (0.4 - ref.current.material.opacity) * 0.06;
  });

  const s = radius * 4;
  return html`
    <sprite ref=${ref} position=${initPos} scale=${[s, s, 1]}>
      <spriteMaterial map=${tex} transparent=${true} opacity=${0} depthWrite=${false} blending=${THREE.NormalBlending} />
    </sprite>
  `;
}

/* ---------------------------------------------------------------- thin ring around focus node */
function FocusRing({ targetPosition, radius }) {
  const mesh = useRef();
  const mat = useRef();
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  if (targetPosition) targetPos.current.copy(targetPosition);
  const [initPos] = useState(() => targetPosition ?
    [targetPosition.x, targetPosition.y, targetPosition.z] : [0, 0, 0]);

  const innerR = radius * 1.12 + 0.12;
  const outerR = innerR + 0.025;

  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.lerp(targetPos.current, 0.08);
    mesh.current.quaternion.copy(camera.quaternion);
    if (mat.current) mat.current.opacity += (0.5 - mat.current.opacity) * 0.06;
  });

  return html`
    <mesh ref=${mesh} position=${initPos}>
      <ringGeometry args=${[innerR, outerR, 64]} />
      <meshBasicMaterial ref=${mat} color=${'#3a362e'} transparent=${true} opacity=${0} side=${THREE.DoubleSide} depthWrite=${false} />
    </mesh>
  `;
}

/* ---------------------------------------------------------------- edges — active / faded / idle */
function Edge({ curvePoints, state }) {
  const lw = state === 'active' ? 1.0 : state === 'faded' ? 0.3 : 0.55;
  const op = state === 'active' ? 0.4 : state === 'faded' ? 0.03 : 0.22;
  return html`
    <${Line}
      points=${curvePoints}
      color=${'#524e45'}
      lineWidth=${lw}
      transparent=${true}
      opacity=${op}
    />
  `;
}

/* ---------------------------------------------------------------- flow particles along active curved edges */
const discTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fillStyle = '#fff'; g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
})();

function FlowParticles({ curves }) {
  const ref = useRef();
  const pPerEdge = 2;
  const count = curves.length * pPerEdge;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(count, 1) * 3), 3));
    return g;
  }, [count]);
  const params = useMemo(() => {
    const rng = mulberry32(42);
    const a = [];
    for (let i = 0; i < curves.length; i++) {
      for (let k = 0; k < pPerEdge; k++) {
        a.push({ phase: rng(), speed: 0.04 + rng() * 0.1 });
      }
    }
    return a;
  }, [curves.length]);
  useFrame((stateObj) => {
    if (!ref.current || curves.length === 0) return;
    const arr = ref.current.geometry.attributes.position.array;
    const t = stateObj.clock.elapsedTime;
    let idx = 0;
    for (let i = 0; i < curves.length; i++) {
      const { a, ctrl, b } = curves[i];
      for (let k = 0; k < pPerEdge; k++) {
        const p = params[i * pPerEdge + k];
        const param = (p.phase + t * p.speed) % 1;
        const omt = 1 - param;
        arr[idx++] = omt * omt * a.x + 2 * omt * param * ctrl.x + param * param * b.x;
        arr[idx++] = omt * omt * a.y + 2 * omt * param * ctrl.y + param * param * b.y;
        arr[idx++] = omt * omt * a.z + 2 * omt * param * ctrl.z + param * param * b.z;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  if (curves.length === 0) return null;
  return html`
    <points ref=${ref} geometry=${geo}>
      <pointsMaterial color=${'#4a463e'} size=${0.20} map=${discTex} sizeAttenuation=${true} transparent=${true} opacity=${0.45} depthWrite=${false} />
    </points>
  `;
}

/* ---------------------------------------------------------------- camera rig: glides toward focus */
function CameraRig({ focusPos, controlsRef, requestRef, layout }) {
  const { camera } = useThree();
  const tween = useRef();

  useEffect(() => {
    requestRef.current = {
      zoom: (factor) => {
        const ctrl = controlsRef.current; if (!ctrl) return;
        const t = ctrl.target;
        const dir = camera.position.clone().sub(t);
        // Clamp to the OrbitControls distance range so wheel input doesn't snap afterwards
        const len = Math.max(ctrl.minDistance || 5, Math.min(dir.length() * factor, ctrl.maxDistance || 110));
        dir.normalize().multiplyScalar(len);
        const np = t.clone().add(dir);
        gsap.to(camera.position, { x: np.x, y: np.y, z: np.z, duration: 0.5, ease: 'power2.out', onUpdate: () => ctrl.update() });
      },
      reset: () => {
        const ctrl = controlsRef.current; if (!ctrl) return;
        const positions = Object.values(layout);
        if (positions.length === 0) return;
        const box = new THREE.Box3();
        positions.forEach(p => box.expandByPoint(p));
        const center = new THREE.Vector3();
        box.getCenter(center);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const fov = camera.fov * (Math.PI / 180);
        const vDist = sphere.radius / Math.tan(fov / 2);
        const hFov = 2 * Math.atan(Math.tan(fov / 2) * (camera.aspect || 1));
        const hDist = sphere.radius / Math.tan(hFov / 2);
        const dist = Math.max(vDist, hDist) * 1.2;
        const ip = new THREE.Vector3(center.x, center.y + 1, center.z + dist);
        const o = { px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx: ctrl.target.x, ty: ctrl.target.y, tz: ctrl.target.z };
        gsap.to(o, { px: ip.x, py: ip.y, pz: ip.z, tx: center.x, ty: center.y, tz: center.z, duration: 0.8, ease: 'power2.inOut',
          onUpdate: () => { camera.position.set(o.px, o.py, o.pz); ctrl.target.set(o.tx, o.ty, o.tz); ctrl.update(); },
        });
      },
    };
  }, [camera, controlsRef, requestRef, layout]);

  useEffect(() => {
    if (!focusPos || !controlsRef.current) return;
    const ctrl = controlsRef.current;
    ctrl.enabled = false;
    if (tween.current) tween.current.kill();

    const narrow = typeof window !== 'undefined' && window.innerWidth < 880;
    const right = new THREE.Vector3().subVectors(camera.position, ctrl.target).cross(camera.up).normalize();
    const up = camera.up.clone().normalize();
    const desiredTarget = narrow
      ? focusPos.clone().add(up.multiplyScalar(-3.2))
      : focusPos.clone().add(right.multiplyScalar(3.4));
    const dir = camera.position.clone().sub(ctrl.target).normalize();
    const dist = narrow ? 22 : 20;
    const desiredPos = desiredTarget.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, narrow ? 0 : 1.4, 0));

    const o = {
      px: camera.position.x, py: camera.position.y, pz: camera.position.z,
      tx: ctrl.target.x, ty: ctrl.target.y, tz: ctrl.target.z,
    };
    tween.current = gsap.to(o, {
      px: desiredPos.x, py: desiredPos.y, pz: desiredPos.z,
      tx: desiredTarget.x, ty: desiredTarget.y, tz: desiredTarget.z,
      duration: 1.15, ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.set(o.px, o.py, o.pz);
        ctrl.target.set(o.tx, o.ty, o.tz);
        ctrl.update();
      },
      onComplete: () => { ctrl.enabled = true; },
    });
  }, [focusPos, camera, controlsRef]);

  return null;
}

/* ---------------------------------------------------------------- initial fit-all: show entire graph on first load */
function FitAll({ layout, controlsRef }) {
  const { camera } = useThree();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const positions = Object.values(layout);
    if (positions.length === 0) return;
    done.current = true;

    const box = new THREE.Box3();
    positions.forEach(p => box.expandByPoint(p));
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const fov = camera.fov * (Math.PI / 180);
    const vDist = sphere.radius / Math.tan(fov / 2);
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * (camera.aspect || 1));
    const hDist = sphere.radius / Math.tan(hFov / 2);
    const dist = Math.max(vDist, hDist) * 1.2;

    camera.position.set(center.x, center.y + 1, center.z + dist);
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [layout, camera, controlsRef]);

  return null;
}

/* ---------------------------------------------------------------- fog that scales with viewing distance
   A fixed fog range washes out the far half of the graph at overview distance
   (and can swallow it entirely on narrow/mobile aspect ratios). Track the
   camera-to-target distance so fog only ever grades the far fringe. */
function AdaptiveFog({ controlsRef }) {
  const { scene, camera } = useThree();
  useFrame(() => {
    const fog = scene.fog;
    if (!fog) return;
    const t = controlsRef.current ? controlsRef.current.target : null;
    const d = t ? camera.position.distanceTo(t) : camera.position.length();
    fog.near += (d * 1.05 - fog.near) * 0.1;
    fog.far += (d * 2.4 - fog.far) * 0.1;
  });
  return null;
}

/* ---------------------------------------------------------------- the 3D scene */
function Scene({ data, expandedLayout, degree, focusId, hoverId, matches, neighborsOf, onPick, onOver, onOut, controlsRef, requestRef }) {
  const neighbors = useMemo(() => neighborsOf(focusId), [focusId, neighborsOf]);
  const focusPos = focusId ? expandedLayout[focusId] : null;

  const nodeState = useCallback((id) => {
    if (id === focusId) return 'focus';
    if (focusId) {
      if (neighbors.has(id)) return id === hoverId ? 'hover' : 'neighbor';
      return id === hoverId ? 'hover' : 'dim';
    }
    if (matches && matches.size) return matches.has(id) ? (id === hoverId ? 'hover' : 'idle') : 'dim';
    return id === hoverId ? 'hover' : 'idle';
  }, [focusId, hoverId, neighbors, matches]);

  const edgeState = useCallback((e) => {
    if (!focusId) return 'idle';
    if (e.source === focusId || e.target === focusId) return 'active';
    return 'faded';
  }, [focusId]);

  const curvedEdges = useMemo(() => {
    return data.edges.map((e) => {
      const a = expandedLayout[e.source], b = expandedLayout[e.target];
      if (!a || !b) return null;
      const { points, ctrl } = computeCurve(a, b);
      return { source: e.source, target: e.target, points, ctrl, a, b };
    }).filter(Boolean);
  }, [data.edges, expandedLayout]);

  const activeCurves = useMemo(() => {
    if (!focusId) return [];
    return curvedEdges
      .filter((e) => e.source === focusId || e.target === focusId)
      .map((e) => ({ a: e.a, ctrl: e.ctrl, b: e.b }));
  }, [focusId, curvedEdges]);

  return html`
    <group>
      <ambientLight intensity=${1} />

      ${curvedEdges.map((e, i) => {
        return html`<${Edge} key=${'e' + i} curvePoints=${e.points} state=${edgeState(e)} />`;
      })}

      <${FlowParticles} curves=${activeCurves} />

      ${focusPos ? html`
        <${FocusRing} key=${'r' + focusId} targetPosition=${focusPos} radius=${nodeRadius(degree[focusId])} />
      ` : null}

      ${data.nodes.map((n) => {
        const p = expandedLayout[n.id];
        if (!p) return null;
        return html`<${NodeMesh}
          key=${n.id}
          node=${n}
          targetPosition=${p}
          radius=${nodeRadius(degree[n.id])}
          state=${nodeState(n.id)}
          onClick=${onPick}
          onOver=${onOver}
          onOut=${onOut}
        />`;
      })}

      ${data.nodes.filter((n) => expandedLayout[n.id]).map((n) => {
        const p = expandedLayout[n.id];
        const r = nodeRadius(degree[n.id]);
        const st = nodeState(n.id);
        if (st === 'dim') return null;
        const cls = 'g-label'
          + (st === 'focus' ? ' g-label-focus'
          : st === 'neighbor' ? ' g-label-neighbor'
          : st === 'hover' ? ' g-label-hover'
          : ' g-label-idle');
        const offset = st === 'focus' ? r + 0.9 : r + 0.55;
        return html`<${AnimatedLabel}
          key=${'l' + n.id}
          id=${n.id}
          targetPosition=${p}
          offset=${offset}
          cls=${cls}
          text=${n.id}
          onPick=${onPick}
          onOver=${onOver}
          onOut=${onOut}
        />`;
      })}

      <${OrbitControls}
        ref=${controlsRef}
        makeDefault=${true}
        enablePan=${true}
        enableDamping=${true}
        dampingFactor=${0.08}
        rotateSpeed=${0.55}
        zoomSpeed=${0.8}
        panSpeed=${0.7}
        minDistance=${5}
        maxDistance=${110}
      />
      <${CameraRig} focusPos=${focusPos} controlsRef=${controlsRef} requestRef=${requestRef} layout=${expandedLayout} />
      <${FitAll} layout=${expandedLayout} controlsRef=${controlsRef} />
      <${AdaptiveFog} controlsRef=${controlsRef} />
    </group>
  `;
}

/* ---------------------------------------------------------------- right detail panel */
function DetailPanel({ node, data, degree, neighborsList, index, total, onPick, onPrev, onNext, typeLabels }) {
  if (!node) {
    const top = [...data.nodes].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0)).slice(0, 8);
    return html`
      <div class="g-panel-inner">
        <h2 class="g-title">关系图谱</h2>
        <p class="g-desc">共收录 ${data.nodes.length} 个节点、${data.edges.length} 条关联。</p>
        <div class="g-section-label">核心节点</div>
        <div class="g-pills">
          ${top.map((nb) => html`
            <button key=${nb.id} class="g-pill" onClick=${() => onPick(nb.id)}>
              <span class=${'g-pill-dot ' + (nb.type === 'company' ? 'is-co' : 'is-pe')}></span>${nb.id}
            </button>
          `)}
        </div>
      </div>
    `;
  }
  return html`
    <div key=${node.id} class=${'g-panel-inner'}>
        <h2 class="g-title">${node.id}</h2>
        <p class="g-desc">${cleanDesc(node.desc, node.id)}</p>

        ${neighborsList.length ? html`
          <div class="g-section-label">关联节点</div>
          <div class="g-pills">
            ${neighborsList.map((nb) => html`
              <button key=${nb.id} class="g-pill" onClick=${() => onPick(nb.id)}>
                <span class=${'g-pill-dot ' + (nb.type === 'company' ? 'is-co' : 'is-pe')}></span>${nb.id}
              </button>
            `)}
          </div>
        ` : html`<div class="g-section-label g-muted">暂无关联节点</div>`}

        <div class="g-actions">
          <a class="g-read" href=${'/wiki/' + node.slug + '/'}>阅读全文 <span class="g-arrow">↗</span></a>
        </div>
    </div>
  `;
}

function cleanDesc(desc, title) {
  if (!desc) return '';
  let d = desc.trim();
  if (d.startsWith(title)) d = d.slice(title.length).trim();
  d = d.replace(/^简介\s*/, '');
  const cut = d.indexOf('关键信息');
  if (cut > 40) d = d.slice(0, cut).trim();
  return d.length > 220 ? d.slice(0, 220).trim() + '...' : d;
}

/* ---------------------------------------------------------------- root app */
function App({ data }) {
  const degree = useMemo(() => {
    const d = {}; data.nodes.forEach((n) => (d[n.id] = 0));
    data.edges.forEach((e) => { d[e.source] = (d[e.source] || 0) + 1; d[e.target] = (d[e.target] || 0) + 1; });
    return d;
  }, [data]);

  const baseLayout = useMemo(() => {
    if (data.layout) {
      const out = {};
      for (const id in data.layout) {
        const p = data.layout[id];
        out[id] = new THREE.Vector3(p[0], p[1], p[2]);
      }
      return out;
    }
    return computeLayout(data.nodes, data.edges, degree);
  }, [data, degree]);

  const adj = useMemo(() => {
    const m = {}; data.nodes.forEach((n) => (m[n.id] = new Set()));
    data.edges.forEach((e) => { m[e.source] && m[e.source].add(e.target); m[e.target] && m[e.target].add(e.source); });
    return m;
  }, [data]);
  const nodeById = useMemo(() => { const m = {}; data.nodes.forEach((n) => (m[n.id] = n)); return m; }, [data]);
  const order = useMemo(() => [...data.nodes].sort((a, b) => (degree[b.id] - degree[a.id]) || a.id.localeCompare(b.id, 'zh')), [data, degree]);

  const typeLabels = { person: '人物', company: '公司' };

  const [focusId, setFocusId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const controlsRef = useRef();
  const requestRef = useRef({});

  /* no auto-focus — initial view shows full graph overview */

  const neighborsOf = useCallback((id) => adj[id] || new Set(), [adj]);

  const expandedLayout = useMemo(() =>
    computeExpandedPositions(focusId, baseLayout, adj, degree),
    [focusId, baseLayout, adj, degree]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const s = new Set();
    data.nodes.forEach((n) => { if (n.id.toLowerCase().includes(q) || (n.desc || '').toLowerCase().includes(q)) s.add(n.id); });
    return s;
  }, [query, data]);

  const pick = useCallback((id) => { setFocusId(id); setQuery(''); setSearchOpen(false); }, []);

  const idx = useMemo(() => order.findIndex((n) => n.id === focusId), [order, focusId]);
  const prev = useCallback(() => {
    if (!order.length) return;
    pick(idx >= 0 ? order[(idx - 1 + order.length) % order.length].id : order[order.length - 1].id);
  }, [idx, order, pick]);
  const next = useCallback(() => {
    if (!order.length) return;
    pick(idx >= 0 ? order[(idx + 1) % order.length].id : order[0].id);
  }, [idx, order, pick]);

  const focusNode = focusId ? nodeById[focusId] : null;
  const neighborsList = useMemo(() => {
    if (!focusId) return [];
    return [...(adj[focusId] || [])]
      .map((id) => nodeById[id])
      .filter(Boolean)
      .sort((a, b) => degree[b.id] - degree[a.id]);
  }, [focusId, adj, nodeById, degree]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return order.filter((n) => matches && matches.has(n.id)).slice(0, 8);
  }, [query, order, matches]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape' && focusId) {
        // First Escape deselects; stop it from reaching the page-level
        // handler that closes the whole overlay (second Escape does that).
        e.stopPropagation();
        setFocusId(null);
      }
    };
    // Capture phase so we run before the document-level overlay-close handler
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [next, prev, focusId]);

  /* click on empty canvas (not a drag) → back to overview */
  const downPos = useRef(null);
  const onCanvasMissed = useCallback((e) => {
    const d = downPos.current;
    if (d && (Math.abs(e.clientX - d[0]) > 5 || Math.abs(e.clientY - d[1]) > 5)) return;
    setFocusId(null);
    setQuery('');
    setSearchOpen(false);
  }, []);

  return html`
    <div class="g-root">
      <div class="g-canvas-wrap" onPointerDown=${(e) => { downPos.current = [e.clientX, e.clientY]; }}>
        <${Canvas}
          camera=${{ position: [0, 2, 26], fov: 42 }}
          gl=${{ antialias: true, alpha: false }}
          dpr=${[1, 2]}
          onPointerMissed=${onCanvasMissed}
          onCreated=${({ scene, gl }) => { scene.fog = new THREE.Fog(C.bg, 32, 75); gl.setClearColor(C.bg, 1); }}
        >
          <${Scene}
            data=${data}
            expandedLayout=${expandedLayout}
            degree=${degree}
            focusId=${focusId}
            hoverId=${hoverId}
            matches=${matches}
            neighborsOf=${neighborsOf}
            onPick=${pick}
            onOver=${setHoverId}
            onOut=${(id) => setHoverId((h) => (h === id ? null : h))}
            controlsRef=${controlsRef}
            requestRef=${requestRef}
          />
        <//>

        <div class=${'g-search' + (searchOpen || query ? ' is-open' : '')}>
          <input
            class="g-search-input"
            placeholder="搜索节点..."
            value=${query}
            onFocus=${() => setSearchOpen(true)}
            onChange=${(e) => setQuery(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter' && searchResults[0]) pick(searchResults[0].id); if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); setSearchOpen(false); e.target.blur(); } }}
          />
          ${searchResults.length ? html`
            <div class="g-search-results">
              ${searchResults.map((n) => html`<button key=${n.id} class="g-search-item" onClick=${() => pick(n.id)}>
                <span class=${'g-pill-dot ' + (n.type === 'company' ? 'is-co' : 'is-pe')}></span>${n.id}
              </button>`)}
            </div>` : null}
        </div>

        <div class="g-legend">
          <span><i class="g-legend-dot is-pe"></i>人物</span>
          <span><i class="g-legend-dot is-co"></i>公司</span>
        </div>

        <div class="g-zoom">
          <button title="放大" onClick=${() => requestRef.current.zoom && requestRef.current.zoom(0.78)}>+</button>
          <button title="缩小" onClick=${() => requestRef.current.zoom && requestRef.current.zoom(1.28)}>-</button>
          <button title="重置" onClick=${() => { setFocusId(null); requestRef.current.reset && requestRef.current.reset(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.36"/><path d="M3 21v-6h6"/></svg>
          </button>
        </div>
      </div>

      <aside class="g-panel">
        <${DetailPanel}
          node=${focusNode}
          data=${data}
          degree=${degree}
          neighborsList=${neighborsList}
          index=${idx < 0 ? 0 : idx}
          total=${order.length}
          onPick=${pick}
          onPrev=${prev}
          onNext=${next}
          typeLabels=${typeLabels}
        />
        <div class="g-nav">
          <button class="g-nav-btn" onClick=${prev}>
            <span class="g-nav-k">上一个</span>
            <span class="g-nav-t">${idx > 0 ? order[(idx - 1 + order.length) % order.length].id : (order[order.length - 1] && order[order.length - 1].id)}</span>
          </button>
          <button class="g-nav-btn g-nav-next" onClick=${next}>
            <span class="g-nav-k">下一个</span>
            <span class="g-nav-t">${idx >= 0 ? order[(idx + 1) % order.length].id : (order[0] && order[0].id)}</span>
          </button>
        </div>
      </aside>
    </div>
  `;
}

/* ---------------------------------------------------------------- mount */
export function mountWikiGraph(el) {
  fetch('/wiki/data.json')
    .then((r) => r.json())
    .then((data) => {
      const root = createRoot(el);
      root.render(html`<${App} data=${data} />`);
      el.__mounted = true;
    })
    .catch((err) => {
      el.innerHTML = '<div style="padding:48px;color:#6f6a60;font-size:14px">图谱加载失败：' + String(err && err.message).replace(/</g, '&lt;') + '</div>';
    });
}
