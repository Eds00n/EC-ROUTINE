import { defaultMarker } from './utils.js';

/** Converte payload mental ({ nodes, edges, canvasBg }) ↔ React Flow. */

export function mentalToFlow(payload) {
  const data = payload && typeof payload === 'object' ? payload : { nodes: [], edges: [] };
  const nodesIn = Array.isArray(data.nodes) ? data.nodes : [];
  const edgesIn = Array.isArray(data.edges) ? data.edges : [];

  const nodes = nodesIn
    .filter((n) => n && n.id != null)
    .map((n) => {
      const isCenter = String(n.id) === 'center';
      const isBalloon = n.shape === 'balloon';
      const width = n.width || (isBalloon ? 220 : isCenter ? 170 : 190);
      const height = n.height || undefined;
      const node = {
        id: String(n.id),
        type: isBalloon ? 'balloon' : isCenter ? 'center' : 'branch',
        position: {
          x: Number.isFinite(n.x) ? n.x : isCenter ? 0 : 120,
          y: Number.isFinite(n.y) ? n.y : isCenter ? 0 : 80,
        },
        data: {
          label: n.label != null ? String(n.label) : isCenter ? 'Centro' : 'Nó',
          description: n.description != null ? String(n.description) : '',
          color: n.color || '',
          fontColor: n.fontColor || '',
          shape: n.shape || '',
          image: n.image || null,
          imageData: n.imageData || '',
          animated: !!n.animated,
          // UI-only — nunca persistidos
          editing: false,
          editingDesc: false,
        },
        style: {
          width,
          ...(height ? { height } : {}),
        },
      };
      if (Array.isArray(n.origin) && n.origin.length === 2) {
        node.origin = [Number(n.origin[0]) || 0, Number(n.origin[1]) || 0];
      }
      return node;
    });

  const edges = edgesIn
    .filter((e) => e && e.from != null && e.to != null)
    .map((e, i) => ({
      id: e.id || `e-${e.from}-${e.to}-${i}`,
      source: String(e.from),
      target: String(e.to),
      type: e.edgeType || 'floating',
      animated: !!e.animated,
      label: e.label || '',
      reconnectable: true,
      markerEnd: defaultMarker,
      data: {
        type: e.type || 'hierarchical',
        label: e.label || '',
      },
    }));

  return {
    nodes,
    edges,
    canvasBg: data.canvasBg || '#3a404a',
  };
}

/**
 * Serializa o grafo para o formato salvo.
 * Só campos estáveis — sem editing*, HTML legado (XSS) nem handles temporários.
 */
export function flowToMental(nodes, edges, canvasBg) {
  const outNodes = (nodes || []).map((n) => {
    const d = n.data || {};
    const item = {
      id: String(n.id),
      label: d.label != null ? String(d.label) : '',
      x: n.position?.x ?? 0,
      y: n.position?.y ?? 0,
    };
    const desc = d.description != null ? String(d.description).trim() : '';
    if (desc) item.description = desc;
    if (d.color) item.color = d.color;
    if (d.fontColor) item.fontColor = d.fontColor;
    if (d.shape === 'balloon' || n.type === 'balloon') item.shape = 'balloon';
    if (d.image && d.image.url) {
      item.image = {
        attachmentId: d.image.attachmentId || undefined,
        url: d.image.url,
      };
    }
    // Guardar base64 como backup mesmo com URL (anexo pode falhar ao carregar depois)
    if (d.imageData && typeof d.imageData === 'string' && d.imageData.indexOf('data:') === 0) {
      item.imageData = d.imageData;
    }
    if (d.animated) item.animated = true;
    if (Array.isArray(n.origin) && n.origin.length === 2) {
      item.origin = [Number(n.origin[0]) || 0, Number(n.origin[1]) || 0];
    }

    const w = n.style?.width ?? n.width ?? n.measured?.width;
    const h = n.style?.height ?? n.height ?? n.measured?.height;
    if (w) item.width = typeof w === 'number' ? w : parseFloat(w) || undefined;
    if (h) item.height = typeof h === 'number' ? h : parseFloat(h) || undefined;
    return item;
  });

  const outEdges = (edges || [])
    .filter((e) => !(e.data && e.data.temporary))
    .map((e) => {
      const item = {
        from: String(e.source),
        to: String(e.target),
        type: (e.data && e.data.type) || (e.animated ? 'relational' : 'hierarchical'),
      };
      if (e.id) item.id = e.id;
      if (e.type && e.type !== 'floating') item.edgeType = e.type;
      else if (e.type) item.edgeType = e.type;
      if (e.animated) item.animated = true;
      const label = e.label || (e.data && e.data.label);
      if (label) item.label = label;
      return item;
    });

  const payload = { nodes: outNodes, edges: outEdges };
  if (canvasBg) payload.canvasBg = canvasBg;
  return payload;
}

export { nextBranchId } from './utils.js';
