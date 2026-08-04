import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  getIncomers,
  getOutgoers,
  getConnectedEdges,
  reconnectEdge,
  SelectionMode,
  ConnectionMode,
} from '@xyflow/react';
import { mentalToFlow, flowToMental } from './adapter.js';
import {
  nextBranchId,
  nextEdgeId,
  defaultEdgeOptionsFor,
  defaultMarker,
  getClosestEdge,
  freezeNodeDimensions,
  normalizeHex6,
  dotColorForCanvasBg,
} from './utils.js';
import { nodeTypes, applyImageToNode } from './nodes.jsx';
import { edgeTypes, CustomConnectionLine } from './edges.jsx';
import ContextMenu from './ContextMenu.jsx';

function FlowInner({ initialPayload, readOnly, canvasBg, onReady, confirmDelete }) {
  const converted = useMemo(() => mentalToFlow(initialPayload), [initialPayload]);
  const seeded = useMemo(
    () => ({
      nodes: converted.nodes.map((n) => ({
        ...n,
        data: { ...n.data, readOnly: !!readOnly },
      })),
      edges: converted.edges,
    }),
    [converted, readOnly],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(seeded.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seeded.edges);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [bg, setBg] = useState(() => normalizeHex6(canvasBg || converted.canvasBg) || '#3a404a');
  const bgDots = useMemo(() => dotColorForCanvasBg(bg), [bg]);

  const applyCanvasBg = useCallback((color) => {
    const next = normalizeHex6(color) || '#3a404a';
    setBg(next);
  }, []);
  const [menu, setMenu] = useState(null);
  const [edgeType, setEdgeType] = useState('smoothstep');
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [flowHighlight, setFlowHighlight] = useState(false);
  const connectStartRef = useRef(null);
  const reconnectOkRef = useRef(true);
  const flowRef = useRef(null);
  const lastPasteTargetRef = useRef(null);
  const { fitView, getNodes, getEdges, screenToFlowPosition, deleteElements, getNode } =
    useReactFlow();

  const flash = useCallback(() => {}, []);

  const resolvePasteTargetId = useCallback(() => {
    const nodes = getNodes().filter((n) => !(n.data && n.data.readOnly));
    if (!nodes.length) return null;

    const active = document.activeElement;
    const fromActive = active?.closest?.('.react-flow__node[data-id]');
    if (fromActive) {
      const id = fromActive.getAttribute('data-id');
      if (id && nodes.some((n) => n.id === id)) return id;
    }

    const selected = nodes.filter((n) => n.selected);
    if (selected.length) return selected[0].id;

    if (lastPasteTargetRef.current && nodes.some((n) => n.id === lastPasteTargetRef.current)) {
      return lastPasteTargetRef.current;
    }

    if (nodes.length === 1) return nodes[0].id;
    return null;
  }, [getNodes]);

  /** Colar imagem (Ctrl+V) no anexo selecionado ou focado */
  useEffect(() => {
    if (readOnly) return undefined;
    const onPaste = (event) => {
      const active = document.activeElement;
      const tag = active && active.tagName ? active.tagName.toUpperCase() : '';
      const items = event.clipboardData && event.clipboardData.items;
      if (!items || !items.length) return;

      let file = null;
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          file = items[i].getAsFile();
          break;
        }
      }
      if (!file) {
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (active && active.isContentEditable)) return;
        return;
      }
      if (file.size > 20 * 1024 * 1024) return;

      const modal = document.getElementById('annotationModal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (!modal.classList.contains('annotation-modal--mental')) return;
      if (!window._annotationMentalUseXyflow) return;

      const targetId = resolvePasteTargetId();
      if (!targetId) return;

      event.preventDefault();
      event.stopPropagation();
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = typeof reader.result === 'string' ? reader.result : '';
        if (!imageData) return;
        applyImageToNode(setNodes, targetId, file, imageData);
      };
      reader.readAsDataURL(file);
    };

    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [readOnly, resolvePasteTargetId, setNodes]);

  const cycleEdgeType = useCallback(() => {
    const order = ['floating', 'smoothstep', 'bezier', 'straight'];
    setEdgeType((t) => {
      const next = order[(order.indexOf(t) + 1) % order.length];
      setEdges((eds) =>
        eds.map((e) =>
          e.data && e.data.temporary ? e : { ...e, type: next },
        ),
      );
      return next;
    });
  }, [setEdges]);

  const toggleAnimateAll = useCallback(() => {
    setEdges((eds) => {
      const real = eds.filter((e) => !(e.data && e.data.temporary));
      const anyOff = real.some((e) => !e.animated);
      return eds.map((e) =>
        e.data && e.data.temporary ? e : { ...e, animated: anyOff },
      );
    });
  }, [setEdges]);

  const computeReachable = useCallback(() => {
    const ns = getNodes();
    const es = getEdges().filter((e) => !(e.data && e.data.temporary));
    const start = ns[0];
    if (!start) return;
    const adj = new Map();
    es.forEach((e) => {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source).push(e.target);
    });
    const seen = new Set([start.id]);
    const q = [start.id];
    while (q.length) {
      const cur = q.shift();
      (adj.get(cur) || []).forEach((t) => {
        if (!seen.has(t)) {
          seen.add(t);
          q.push(t);
        }
      });
    }
    setNodes((list) =>
      list.map((n) => ({
        ...n,
        style: { ...n.style, opacity: seen.has(n.id) ? 1 : 0.35 },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
          ...(e.style || {}),
          opacity: seen.has(e.source) && seen.has(e.target) ? 1 : 0.25,
        },
      })),
    );
    setFlowHighlight(true);
  }, [getEdges, getNodes, setEdges, setNodes]);

  const clearCompute = useCallback(() => {
    setNodes((list) =>
      list.map((n) => ({
        ...n,
        style: { ...n.style, opacity: 1 },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: { ...(e.style || {}), opacity: 1 },
      })),
    );
    setFlowHighlight(false);
  }, [setEdges, setNodes]);

  const addBranchNode = useCallback(
    (opts = {}) => {
      if (readOnly) return null;
      let createdId = null;
      const type = opts.shape === 'balloon' ? 'balloon' : 'branch';
      setNodes((ns) => {
        const id = nextBranchId(ns);
        createdId = id;
        return ns.concat({
          id,
          type,
          position: {
            x: opts.x != null ? opts.x : 100 + Math.random() * 220,
            y: opts.y != null ? opts.y : 100 + Math.random() * 160,
          },
          data: {
            label: opts.label || (type === 'balloon' ? 'Texto' : 'Novo nó'),
            description: '',
            shape: opts.shape || '',
            readOnly: false,
          },
          style: { width: type === 'balloon' ? 220 : 190 },
        });
      });
      window.setTimeout(() => fitView({ padding: 0.25 }), 40);
      flash(`Criado: ${opts.label || (type === 'balloon' ? 'Texto' : 'Novo nó')}`, 'ok');
      return createdId;
    },
    [fitView, flash, readOnly, setNodes],
  );

  useEffect(() => {
    if (typeof onReady !== 'function') return;
    onReady({
      getData() {
        return flowToMental(getNodes(), getEdges(), bg);
      },
      /** Aplica referências de anexo após upload (salva fiel sem base64 residual). */
      applyMentalNodeImages(mentalNodes) {
        if (!Array.isArray(mentalNodes)) return;
        const byId = {};
        mentalNodes.forEach((n) => {
          if (n && n.id != null) byId[String(n.id)] = n;
        });
        setNodes((ns) =>
          ns.map((n) => {
            const m = byId[String(n.id)];
            if (!m) return n;
            return {
              ...n,
              data: {
                ...n.data,
                image: m.image || null,
                imageData: m.imageData || '',
              },
            };
          }),
        );
      },
      addNode: addBranchNode,
      setCanvasBg(color) {
        applyCanvasBg(color);
      },
      getCanvasBg() {
        return bg;
      },
      fitView() {
        fitView({ padding: 0.2 });
      },
    });
  }, [addBranchNode, applyCanvasBg, bg, fitView, getEdges, getNodes, onReady, setNodes]);

  useEffect(() => {
    const canvas = document.getElementById('annotationMentalCanvas');
    if (canvas) {
      canvas.style.setProperty('background-color', bg, 'important');
      canvas.style.backgroundImage = 'none';
    }
    if (typeof window !== 'undefined' && window._annotationMentalData) {
      window._annotationMentalData.canvasBg = bg;
    }
  }, [bg]);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ padding: 0.2 }), 40);
    return () => window.clearTimeout(t);
  }, [fitView]);

  const onConnect = useCallback(
    (params) => {
      if (readOnly) return;
      const startId = connectStartRef.current?.nodeId;
      let source = params.source;
      let target = params.target;
      let sourceHandle = params.sourceHandle;
      let targetHandle = params.targetHandle;

      // Setaponta para onde soltou: origem do arraste = source
      if (startId && source !== startId && target === startId) {
        source = params.target;
        target = params.source;
        sourceHandle = params.targetHandle;
        targetHandle = params.sourceHandle;
      }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            source,
            target,
            sourceHandle,
            targetHandle,
            ...defaultEdgeOptionsFor(edgeType),
            id: nextEdgeId(eds, source, target),
            markerEnd: defaultMarker,
            markerStart: undefined,
            data: { type: 'relational', label: '' },
          },
          eds,
        ),
      );
      flash('Ligação criada', 'ok');
    },
    [edgeType, flash, readOnly, setEdges],
  );

  const onReconnectStart = useCallback(() => {
    reconnectOkRef.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      if (readOnly) return;
      reconnectOkRef.current = true;
      const startId = connectStartRef.current?.nodeId;
      let next = { ...newConnection };
      if (startId && next.source !== startId && next.target === startId) {
        next = {
          ...next,
          source: newConnection.target,
          target: newConnection.source,
          sourceHandle: newConnection.targetHandle,
          targetHandle: newConnection.sourceHandle,
        };
      }
      setEdges((eds) =>
        reconnectEdge(oldEdge, { ...next, markerEnd: defaultMarker }, eds).map((e) =>
          e.id === oldEdge.id
            ? { ...e, markerEnd: defaultMarker, markerStart: undefined }
            : e,
        ),
      );
      flash('Ligação religada', 'ok');
    },
    [flash, readOnly, setEdges],
  );

  const onReconnectEnd = useCallback(
    (_event, edge) => {
      if (readOnly || !edge) return;
      if (!reconnectOkRef.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        flash('Ligação removida ao soltar', 'warn');
      }
      reconnectOkRef.current = true;
    },
    [flash, readOnly, setEdges],
  );

  const onNodesDelete = useCallback(
    (deleted) => {
      if (readOnly) return;
      const edgeSnap = edgesRef.current.filter((e) => !(e.data && e.data.temporary));
      let remainingNodes = [...nodesRef.current];

      const nextEdges = deleted.reduce((acc, node) => {
        const incomers = getIncomers(node, remainingNodes, acc);
        const outgoers = getOutgoers(node, remainingNodes, acc);
        const connectedEdges = getConnectedEdges([node], acc);
        const remainingEdges = acc.filter(
          (edge) => !connectedEdges.some((ce) => ce.id === edge.id),
        );
        const createdEdges = incomers.flatMap(({ id: source }) =>
          outgoers
            .filter((o) => o.id !== source)
            .map(({ id: target }) => ({
              id: nextEdgeId(remainingEdges, source, target),
              source,
              target,
              ...defaultEdgeOptionsFor(edgeType),
              data: { type: 'relational', label: '' },
            })),
        );
        remainingNodes = remainingNodes.filter((rn) => rn.id !== node.id);
        return [...remainingEdges, ...createdEdges];
      }, edgeSnap);

      setEdges(nextEdges);
      flash('Nó apagado — ligações religadas', 'warn');
    },
    [edgeType, flash, readOnly, setEdges],
  );

  const askDeleteConfirm = useCallback(
    async (params) => {
      if (typeof confirmDelete === 'function') {
        return !!(await confirmDelete(params || {}));
      }
      if (typeof window !== 'undefined' && typeof window.openEcConfirmModal === 'function') {
        return !!(await window.openEcConfirmModal({
          title: 'Excluir?',
          message: 'Tem certeza que deseja excluir? Esta ação não pode ser desfeita.',
          confirmLabel: 'Excluir',
          cancelLabel: 'Cancelar',
        }));
      }
      return window.confirm('Tem certeza que deseja excluir?');
    },
    [confirmDelete],
  );

  const onBeforeDelete = useCallback(
    async (params) => {
      if (readOnly) return false;
      return askDeleteConfirm(params);
    },
    [askDeleteConfirm, readOnly],
  );

  const onNodeDoubleClick = useCallback(
    (_evt, node) => {
      if (readOnly || !node) return;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, editing: true } }
            : { ...n, data: { ...n.data, editing: false } },
        ),
      );
    },
    [readOnly, setNodes],
  );

  /**
   * Só classList (sem setState): setState no dragStart re-renderizava todos os nós
   * e deixava o arraste “travado”. CSS esconde toolbar/grid; o prop `dragging` unmounta
   * o chrome do nó que está sendo arrastado.
   */
  const setInteracting = useCallback((active) => {
    const el = flowRef.current;
    if (el) el.classList.toggle('is-interacting', !!active);
  }, []);

  const onNodeClick = useCallback((_evt, node) => {
    if (node && !(node.data && node.data.readOnly)) {
      lastPasteTargetRef.current = node.id;
    }
  }, []);

  const onNodeDragStart = useCallback(
    (_evt, node) => {
      setInteracting(true);
      if (readOnly || !node) return;
      const live = getNode(node.id) || node;
      let domRect = null;
      try {
        const sel = `.react-flow__node[data-id="${CSS.escape(String(node.id))}"]`;
        const el = flowRef.current?.querySelector(sel);
        if (el) domRect = el.getBoundingClientRect();
      } catch (_) {}
      setNodes((ns) =>
        ns.map((n) => (n.id === live.id ? freezeNodeDimensions(live, domRect) : n)),
      );
    },
    [getNode, readOnly, setInteracting, setNodes],
  );

  const onMoveStart = useCallback(() => {
    setInteracting(true);
  }, [setInteracting]);

  const onMoveEnd = useCallback(() => {
    setInteracting(false);
  }, [setInteracting]);

  /**
   * Durante o arraste NÃO atualizar React state (interseção / aresta temporária).
   * Isso era o principal “peso”: setNodes/setEdges a cada frame.
   * A proximidade só resolve no soltar (onNodeDragStop).
   */
  const onNodeDragStop = useCallback(
    (_evt, node) => {
      setInteracting(false);
      if (readOnly || !node) return;
      const liveNodes = getNodes();
      const dragged = liveNodes.find((n) => n.id === node.id) || node;
      const closest = getClosestEdge(dragged, liveNodes);
      let created = false;
      setEdges((eds) => {
        const real = eds.filter((e) => !(e.data && e.data.temporary));
        if (!closest) return real;
        if (real.some((e) => e.source === closest.source && e.target === closest.target)) {
          return real;
        }
        created = true;
        return real.concat({
          ...closest,
          id: nextEdgeId(real, closest.source, closest.target),
          className: undefined,
          animated: false,
          data: { type: 'relational', label: '', temporary: false },
          markerEnd: defaultMarker,
          type: edgeType,
        });
      });
      if (created) flash('Proximidade: ligação criada', 'ok');
    },
    [edgeType, flash, getNodes, readOnly, setEdges, setInteracting],
  );

  useEffect(
    () => () => {
      setInteracting(false);
    },
    [setInteracting],
  );

  const onConnectStart = useCallback((_evt, params) => {
    connectStartRef.current = params;
  }, []);

  /**
   * Add Node On Edge Drop (https://reactflow.dev/examples/nodes/add-node-on-edge-drop)
   * Arrasta a ligação de um nó e solta no vazio → cria nó na posição do cursor.
   */
  const onConnectEnd = useCallback(
    (event, connectionState) => {
      if (readOnly) return;

      const start = connectStartRef.current;
      connectStartRef.current = null;

      // Ligação válida (entrou em outro handle) — não cria nó
      if (connectionState?.isValid) return;

      const fromNodeId =
        connectionState?.fromNode?.id ||
        connectionState?.from?.id ||
        start?.nodeId ||
        null;
      if (!fromNodeId) return;

      // Ignora drop em painéis / controles
      const targetEl = event?.target;
      if (targetEl && typeof targetEl.closest === 'function') {
        if (
          targetEl.closest(
            '.ec-xy-panel, .ec-xy-panel__btn, .react-flow__controls, .react-flow__minimap, .ec-xy-context-menu, .annotation-mental-toolbar, .annotation-modal-actions',
          )
        ) {
          return;
        }
      }

      const { clientX, clientY } =
        event && 'changedTouches' in event ? event.changedTouches[0] : event;
      if (clientX == null || clientY == null) return;

      // Posição do cursor no fluxo.
      // Igual ao exemplo oficial: origin [0.5, 0] = ponto de drop no centro superior do retângulo.
      // Precisa de width/initialWidth — sem isso o offset vira 0 e o nó nasce no canto.
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      const id = nextBranchId(getNodes());
      const NODE_W = 190;
      const NODE_H = 52;

      setNodes((nds) =>
        nds.concat({
          id,
          type: 'branch',
          origin: [0.5, 0],
          position,
          width: NODE_W,
          height: NODE_H,
          initialWidth: NODE_W,
          initialHeight: NODE_H,
          style: { width: NODE_W, minHeight: NODE_H },
          data: { label: 'Novo nó', description: '', readOnly: false },
        }),
      );
      setEdges((eds) =>
        eds.concat({
          id: nextEdgeId(eds, fromNodeId, id),
          source: fromNodeId,
          sourceHandle: start?.handleId || connectionState?.fromHandle?.id || null,
          target: id,
          targetHandle: null,
          ...defaultEdgeOptionsFor(edgeType),
          markerEnd: defaultMarker,
          markerStart: undefined,
          data: { type: 'relational', label: '' },
        }),
      );
      flash('Nó criado ao soltar ligação', 'ok');
    },
    [edgeType, flash, getNodes, readOnly, screenToFlowPosition, setEdges, setNodes],
  );

  const onNodeContextMenu = useCallback(
    (event, node) => {
      if (readOnly) return;
      event.preventDefault();
      const pane = flowRef.current?.getBoundingClientRect?.() || { width: 800, height: 600 };
      setMenu({
        id: node.id,
        top: event.clientY < pane.height - 200 ? event.clientY : undefined,
        left: event.clientX < pane.width - 200 ? event.clientX : undefined,
        right: event.clientX >= pane.width - 200 ? pane.width - event.clientX : undefined,
        bottom: event.clientY >= pane.height - 200 ? pane.height - event.clientY : undefined,
      });
    },
    [readOnly],
  );

  const onPaneClick = useCallback(() => setMenu(null), []);

  return (
    <div
      className="ec-xy-root"
      style={{ background: bg, '--ec-xy-canvas-bg': bg }}
      ref={flowRef}
    >
      <ReactFlow
        style={{ backgroundColor: bg }}
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={onConnect}
        onReconnect={readOnly ? undefined : onReconnect}
        onReconnectStart={readOnly ? undefined : onReconnectStart}
        onReconnectEnd={readOnly ? undefined : onReconnectEnd}
        onNodesDelete={onNodesDelete}
        onBeforeDelete={onBeforeDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptionsFor(edgeType)}
        connectionLineComponent={CustomConnectionLine}
        connectionLineStyle={{ stroke: 'rgba(255,255,255,0.75)', strokeWidth: 2 }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        edgesReconnectable={!readOnly}
        connectionMode={ConnectionMode.Loose}
        onlyRenderVisibleElements
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        autoPanOnNodeDrag={false}
        autoPanOnConnect={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        selectionMode={SelectionMode.Partial}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        snapToGrid={false}
        panOnDrag
        zoomOnScroll
        preventScrolling
        minZoom={0.2}
        maxZoom={2.5}
        nodeDragThreshold={8}
      >
        <Background
          id="ec-xy-dots"
          gap={28}
          size={1}
          color={bgDots}
          style={{ transition: 'opacity 0.12s ease' }}
        />
        {showMiniMap ? <MiniMap pannable zoomable nodeStrokeWidth={2} /> : null}
        <Controls showInteractive={!readOnly} position="bottom-left">
          {!readOnly ? (
            <>
              <ControlButton
                className="nodrag nopan"
                onClick={() => addBranchNode({ label: 'Novo nó' })}
                data-tip="Adicionar nó"
                aria-label="Adicionar nó"
              >
                <span className="ec-xy-ctrl-label">+</span>
              </ControlButton>
              <ControlButton
                className="nodrag nopan"
                onClick={() => addBranchNode({ label: 'Texto', shape: 'balloon' })}
                data-tip="Balão de texto"
                aria-label="Balão de texto"
              >
                <span className="ec-xy-ctrl-label">T</span>
              </ControlButton>
              <ControlButton
                className="nodrag nopan"
                onClick={cycleEdgeType}
                data-tip={`Tipo de aresta: ${edgeType}`}
                aria-label={`Tipo de aresta: ${edgeType}`}
              >
                <span className="ec-xy-ctrl-label ec-xy-ctrl-label--sm">
                  {edgeType === 'floating'
                    ? '∿'
                    : edgeType === 'smoothstep'
                      ? '⌞'
                      : edgeType === 'bezier'
                        ? '⌒'
                        : '/'}
                </span>
              </ControlButton>
              <ControlButton
                className="nodrag nopan"
                onClick={toggleAnimateAll}
                data-tip="Alternar animação das ligações"
                aria-label="Alternar animação das ligações"
              >
                <span className="ec-xy-ctrl-label ec-xy-ctrl-label--sm">▷</span>
              </ControlButton>
              <ControlButton
                className="nodrag nopan"
                onClick={() => (flowHighlight ? clearCompute() : computeReachable())}
                data-tip={flowHighlight ? 'Limpar destaque de fluxo' : 'Destacar fluxo'}
                aria-label={flowHighlight ? 'Limpar destaque de fluxo' : 'Destacar fluxo'}
              >
                <span className="ec-xy-ctrl-label ec-xy-ctrl-label--sm">◎</span>
              </ControlButton>
              <label
                className="react-flow__controls-button nodrag nopan ec-xy-bg-control"
                data-tip="Cor de fundo do canvas"
                aria-label="Cor de fundo do canvas"
              >
                <span
                  className="ec-xy-bg-swatch"
                  style={{ background: bg }}
                  aria-hidden="true"
                />
                <input
                  type="color"
                  className="ec-xy-bg-input-hit"
                  value={bg}
                  onChange={(e) => applyCanvasBg(e.target.value)}
                  onInput={(e) => applyCanvasBg(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  title="Cor de fundo do canvas"
                />
              </label>
              <ControlButton
                className="nodrag nopan"
                onClick={() => setShowMiniMap((v) => !v)}
                data-tip={showMiniMap ? 'Ocultar minimapa' : 'Mostrar minimapa'}
                aria-label={showMiniMap ? 'Ocultar minimapa' : 'Mostrar minimapa'}
              >
                <span className="ec-xy-ctrl-label ec-xy-ctrl-label--sm">⛶</span>
              </ControlButton>
            </>
          ) : null}
        </Controls>
      </ReactFlow>

      {menu ? (
        <ContextMenu
          {...menu}
          canDelete
          onClick={() => setMenu(null)}
          onEdit={(id) => {
            setNodes((ns) =>
              ns.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      selected: true,
                      data: { ...n.data, editing: true, editingDesc: false },
                    }
                  : { ...n, data: { ...n.data, editing: false, editingDesc: false } },
              ),
            );
          }}
          onEditDesc={(id) => {
            setNodes((ns) =>
              ns.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      selected: true,
                      data: { ...n.data, editing: false, editingDesc: true },
                    }
                  : { ...n, data: { ...n.data, editing: false, editingDesc: false } },
              ),
            );
          }}
          onAnimate={(id) => {
            setEdges((eds) =>
              eds.map((e) =>
                e.source === id || e.target === id ? { ...e, animated: !e.animated } : e,
              ),
            );
          }}
          onDuplicate={(id) => {
            const node = getNode(id);
            if (!node) return;
            const newId = nextBranchId(getNodes());
            setNodes((ns) =>
              ns.concat({
                ...node,
                id: newId,
                position: { x: node.position.x + 48, y: node.position.y + 48 },
                selected: false,
                data: { ...node.data },
              }),
            );
          }}
          onDelete={(id) => {
            deleteElements({ nodes: [{ id }] });
          }}
        />
      ) : null}
    </div>
  );
}

export default function MentalFlowApp(props) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
