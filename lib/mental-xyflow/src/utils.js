import { Position, MarkerType } from '@xyflow/react';

export function nextBranchId(nodes) {
  let max = 0;
  (nodes || []).forEach((n) => {
    const m = String(n.id || '').match(/^b(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'b' + (max + 1);
}

export function nextEdgeId(edges, source, target) {
  const base = `e-${source}-${target}`;
  if (!(edges || []).some((e) => e.id === base)) return base;
  let i = 1;
  while ((edges || []).some((e) => e.id === `${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export const defaultMarker = {
  type: MarkerType.ArrowClosed,
  width: 20,
  height: 20,
  color: '#f4f4f5',
};

/** Lê largura/altura efetivas do nó (medidas, style ou props do RF). */
export function readNodeDimensions(node) {
  if (!node) return null;
  const w = node.measured?.width ?? node.width ?? node.style?.width;
  const h = node.measured?.height ?? node.height ?? node.style?.height;
  const width = typeof w === 'number' ? w : w != null && w !== '' ? parseFloat(String(w)) : NaN;
  const height = typeof h === 'number' ? h : h != null && h !== '' ? parseFloat(String(h)) : NaN;
  if (!Number.isFinite(width) && !Number.isFinite(height)) return null;
  return {
    width: Number.isFinite(width) ? Math.round(width) : undefined,
    height: Number.isFinite(height) ? Math.round(height) : undefined,
  };
}

/** Grava dimensões no style para não colapsar ao arrastar. */
export function freezeNodeDimensions(node, domRect) {
  if (!node) return node;
  const fromNode = readNodeDimensions(node);
  const width = fromNode?.width ?? (domRect ? Math.round(domRect.width) : undefined);
  const height = fromNode?.height ?? (domRect ? Math.round(domRect.height) : undefined);
  if (!width && !height) return node;
  const style = { ...(node.style || {}) };
  if (width) style.width = width;
  if (height) style.height = height;
  return { ...node, style };
}

export function normalizeHex6(color) {
  if (!color || typeof color !== 'string') return '';
  const raw = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return (
      '#' +
      raw
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  }
  return '';
}

export function dotColorForCanvasBg(hex) {
  const h = normalizeHex6(hex) || '#3a404a';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 115 ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255, 255, 255, 0.14)';
}

export function defaultEdgeOptionsFor(type = 'floating') {
  return {
    type,
    animated: false,
    markerEnd: defaultMarker,
    data: { type: 'relational', label: '' },
    reconnectable: true,
  };
}

/** Bounding box helpers for floating edges / intersections */
function getNodeRect(node) {
  const w = node.measured?.width ?? node.width ?? node.initialWidth ?? node.style?.width ?? 160;
  const h = node.measured?.height ?? node.height ?? node.initialHeight ?? node.style?.height ?? 48;
  const width = typeof w === 'number' ? w : parseFloat(w) || 160;
  const height = typeof h === 'number' ? h : parseFloat(h) || 48;

  // positionAbsolute já considera origin; position pura precisa do offset (igual ao exemplo)
  if (node.internals?.positionAbsolute) {
    return {
      x: node.internals.positionAbsolute.x,
      y: node.internals.positionAbsolute.y,
      width,
      height,
    };
  }

  const ox = (node.origin?.[0] ?? 0) * width;
  const oy = (node.origin?.[1] ?? 0) * height;
  return {
    x: node.position.x - ox,
    y: node.position.y - oy,
    width,
    height,
  };
}

function getNodeIntersection(intersectionNode, targetNode) {
  const a = getNodeRect(intersectionNode);
  const b = getNodeRect(targetNode);
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const ww = a.width / 2;
  const hh = a.height / 2;
  if (dx === 0 && dy === 0) return { x: ax, y: ay };
  const scale = Math.min(
    Math.abs(ww / (dx || 0.0001)),
    Math.abs(hh / (dy || 0.0001)),
  );
  return { x: ax + dx * scale, y: ay + dy * scale };
}

function getEdgePosition(node, point) {
  const r = getNodeRect(node);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const nx = Math.round(cx);
  const ny = Math.round(cy);
  if (px <= nx - Math.round(r.width / 2) + 1) return Position.Left;
  if (px >= nx + Math.round(r.width / 2) - 1) return Position.Right;
  if (py <= ny - Math.round(r.height / 2) + 1) return Position.Top;
  if (py >= ny + Math.round(r.height / 2) - 1) return Position.Bottom;
  return Position.Top;
}

export function getEdgeParams(source, target) {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);
  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos: getEdgePosition(source, sourceIntersection),
    targetPos: getEdgePosition(target, targetIntersection),
  };
}

export function boxesIntersect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function getAbsoluteBox(node) {
  return getNodeRect(node);
}

const MIN_DISTANCE = 140;

export function getClosestEdge(node, nodes) {
  if (!node) return null;
  const a = getAbsoluteBox(node);
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  let closest = null;
  let min = Number.MAX_VALUE;
  nodes.forEach((n) => {
    if (n.id === node.id) return;
    const b = getAbsoluteBox(n);
    const dx = acx - (b.x + b.width / 2);
    const dy = acy - (b.y + b.height / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < min && d < MIN_DISTANCE) {
      min = d;
      closest = {
        id: `temp-${node.id}-${n.id}`,
        source: node.id,
        target: n.id,
        className: 'ec-xy-temp-edge',
        type: 'floating',
        animated: false,
        data: { temporary: true },
      };
    }
  });
  return closest;
}
