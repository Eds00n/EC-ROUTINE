import React, { memo, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeToolbar,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import { getEdgeParams, defaultMarker } from './utils.js';

function EdgeToolbarActions({ id, label, animated }) {
  const { setEdges, deleteElements } = useReactFlow();

  const editLabel = useCallback(() => {
    const next = window.prompt('Rótulo da ligação', label || '');
    if (next === null) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, label: next, data: { ...(e.data || {}), label: next } }
          : e,
      ),
    );
  }, [id, label, setEdges]);

  const toggleAnim = useCallback(() => {
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, animated: !e.animated } : e)));
  }, [id, setEdges]);

  const cycleType = useCallback(() => {
    const order = ['floating', 'smoothstep', 'bezier', 'straight'];
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== id) return e;
        const i = order.indexOf(e.type || 'floating');
        return { ...e, type: order[(i + 1) % order.length] };
      }),
    );
  }, [id, setEdges]);

  const remove = useCallback(() => {
    deleteElements({ edges: [{ id }] });
  }, [deleteElements, id]);

  return (
    <EdgeToolbar isVisible edgeId={id} className="ec-xy-edge-toolbar">
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Editar rótulo da ligação"
        aria-label="Editar rótulo da ligação"
        onClick={editLabel}
      >
        Rótulo
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip={animated ? 'Parar animação da ligação' : 'Animar ligação'}
        aria-label={animated ? 'Parar animação da ligação' : 'Animar ligação'}
        onClick={toggleAnim}
      >
        {animated ? 'Parar' : 'Animar'}
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Alternar tipo da ligação"
        aria-label="Alternar tipo da ligação"
        onClick={cycleType}
      >
        Tipo
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn ec-xy-tb-btn--danger nodrag nopan"
        data-tip="Apagar ligação"
        aria-label="Apagar ligação"
        onClick={remove}
      >
        Apagar
      </button>
    </EdgeToolbar>
  );
}

function LabelBadge({ label, x, y }) {
  if (!label) return null;
  return (
    <EdgeLabelRenderer>
      <div
        className="ec-xy-edge-label nodrag nopan"
        style={{
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          pointerEvents: 'all',
        }}
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}

export const FloatingEdge = memo(function FloatingEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  label,
  animated,
  selected,
}) {
  const store = useStoreApi();
  const { nodeLookup } = store.getState();
  const sourceNode = nodeLookup?.get?.(source);
  const targetNode = nodeLookup?.get?.(target);

  let path;
  let labelX;
  let labelY;

  if (sourceNode && targetNode) {
    const p = getEdgeParams(sourceNode, targetNode);
    [path, labelX, labelY] = getBezierPath({
      sourceX: p.sx,
      sourceY: p.sy,
      targetX: p.tx,
      targetY: p.ty,
      sourcePosition: p.sourcePos,
      targetPosition: p.targetPos,
    });
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  const text = label || data?.label || '';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd || defaultMarker}
        markerStart={undefined}
        style={style}
        className={selected ? 'ec-xy-edge is-selected' : 'ec-xy-edge'}
      />
      {text ? <LabelBadge label={text} x={labelX} y={labelY} /> : null}
      {selected ? <EdgeToolbarActions id={id} label={text} animated={animated} /> : null}
    </>
  );
});

export const BezierEdgeCustom = memo(function BezierEdgeCustom(props) {
  const [path, labelX, labelY] = getBezierPath(props);
  const text = props.label || props.data?.label || '';
  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        markerEnd={props.markerEnd || defaultMarker}
        markerStart={undefined}
        className={props.selected ? 'ec-xy-edge is-selected' : 'ec-xy-edge'}
      />
      <LabelBadge label={text} x={labelX} y={labelY} />
      {props.selected ? (
        <EdgeToolbarActions id={props.id} label={text} animated={props.animated} />
      ) : null}
    </>
  );
});

export const SmoothEdgeCustom = memo(function SmoothEdgeCustom(props) {
  const [path, labelX, labelY] = getSmoothStepPath(props);
  const text = props.label || props.data?.label || '';
  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        markerEnd={props.markerEnd || defaultMarker}
        markerStart={undefined}
        className={props.selected ? 'ec-xy-edge is-selected' : 'ec-xy-edge'}
      />
      <LabelBadge label={text} x={labelX} y={labelY} />
      {props.selected ? (
        <EdgeToolbarActions id={props.id} label={text} animated={props.animated} />
      ) : null}
    </>
  );
});

export const StraightEdgeCustom = memo(function StraightEdgeCustom(props) {
  const [path, labelX, labelY] = getStraightPath(props);
  const text = props.label || props.data?.label || '';
  return (
    <>
      <BaseEdge
        {...props}
        path={path}
        markerEnd={props.markerEnd || defaultMarker}
        markerStart={undefined}
        className={props.selected ? 'ec-xy-edge is-selected' : 'ec-xy-edge'}
      />
      <LabelBadge label={text} x={labelX} y={labelY} />
      {props.selected ? (
        <EdgeToolbarActions id={props.id} label={text} animated={props.animated} />
      ) : null}
    </>
  );
});

export const edgeTypes = {
  floating: FloatingEdge,
  bezier: BezierEdgeCustom,
  smoothstep: SmoothEdgeCustom,
  straight: StraightEdgeCustom,
};

export function CustomConnectionLine({ fromX, fromY, toX, toY }) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });
  /* Sem <defs>/<marker> por frame — bem mais leve no arraste da ligação */
  return (
    <g>
      <path
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={2}
        className="ec-xy-connection"
        d={path}
      />
      <circle cx={toX} cy={toY} fill="#fff" r={3.5} />
    </g>
  );
}
