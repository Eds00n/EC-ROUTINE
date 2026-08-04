import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Handle,
  Position,
  NodeResizer,
  NodeToolbar,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { freezeNodeDimensions, readNodeDimensions } from './utils.js';

const MAX_NODE_IMAGE_BYTES = 20 * 1024 * 1024;

function dataUrlToFile(dataUrl, name) {
  if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
  try {
    const parts = dataUrl.split(',');
    const meta = parts[0] || '';
    const b64 = parts[1] || '';
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'image.png', { type: mime });
  } catch (_) {
    return null;
  }
}

function uploadNodeImageFile(setNodes, nodeId, file, imageData) {
  if (!file || !nodeId) return;
  const uploadFn =
    typeof window !== 'undefined' && typeof window.uploadMentalImage === 'function'
      ? window.uploadMentalImage
      : null;
  if (!uploadFn) return;
  uploadFn(file)
    .then((ref) => {
      if (!ref) return;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  image: { attachmentId: ref.attachmentId, url: ref.url },
                  imageData: n.data?.imageData || imageData || '',
                },
              }
            : n,
        ),
      );
    })
    .catch(() => {});
}

function askRemoveImageConfirm() {
  if (typeof window !== 'undefined' && typeof window.openEcConfirmModal === 'function') {
    return window.openEcConfirmModal({
      title: 'Remover imagem?',
      message: 'Tem certeza que deseja remover a imagem deste anexo?',
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
    }).then(Boolean);
  }
  return Promise.resolve(
    window.confirm('Tem certeza que deseja remover a imagem deste anexo?'),
  );
}

export function applyImageToNode(setNodes, nodeId, file, imageData) {
  if (!imageData) return;
  setNodes((ns) =>
    ns.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, imageData, image: null } } : n,
    ),
  );
  uploadNodeImageFile(setNodes, nodeId, file || dataUrlToFile(imageData, 'image.png'), imageData);
}

function nodePropsAreEqual(prev, next) {
  if (prev.id !== next.id) return false;
  if (prev.dragging !== next.dragging) return false;
  if (prev.selected !== next.selected) return false;
  return prev.data === next.data;
}

function resolveImageFetchUrl(src) {
  if (!src) return '';
  if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return src;
  if (typeof window !== 'undefined' && typeof window.getAttachmentFullUrl === 'function') {
    return window.getAttachmentFullUrl(src);
  }
  if (src.indexOf('http') === 0 || src.indexOf('//') === 0) return src;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** Imagem com Bearer para /api/attachments; usa base64 local se o anexo falhar. */
function AuthAwareImage({ src, fallbackData, nodeId, onLoad }) {
  const [displaySrc, setDisplaySrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const applyFallback = () => {
      if (cancelled) return;
      if (fallbackData && fallbackData.indexOf('data:') === 0) {
        setDisplaySrc(fallbackData);
      } else if (src && src.indexOf('data:') === 0) {
        setDisplaySrc(src);
      } else {
        setDisplaySrc('');
      }
    };

    if (!src) {
      applyFallback();
      return undefined;
    }
    if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) {
      setDisplaySrc(src);
      return undefined;
    }

    const needsAuth = src.indexOf('/api/attachments/') !== -1;
    if (!needsAuth) {
      setDisplaySrc(resolveImageFetchUrl(src));
      return undefined;
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      applyFallback();
      return undefined;
    }

    const full = resolveImageFetchUrl(src);

    fetch(full, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('fetch');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        applyFallback();
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
      }
    };
  }, [src, fallbackData, nodeId]);

  if (!displaySrc) return null;
  return (
    <img
      className="ec-xy-node__img"
      src={displaySrc}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
    />
  );
}

function useNodeDimensions(id) {
  return useStore(
    useCallback((state) => readNodeDimensions(state.nodeLookup.get(id)), [id]),
  );
}

function EasyHandles() {
  // Só source + ConnectionMode.Loose: a ligação segue a ordem do arraste (origem → destino)
  return (
    <>
      <Handle className="ec-xy-handle" type="source" position={Position.Top} id="t" />
      <Handle className="ec-xy-handle" type="source" position={Position.Right} id="r" />
      <Handle className="ec-xy-handle" type="source" position={Position.Bottom} id="b" />
      <Handle className="ec-xy-handle" type="source" position={Position.Left} id="l" />
    </>
  );
}

function clearEditFlags(data) {
  return { ...(data || {}), editing: false, editingDesc: false };
}

function startLabelEdit(setNodes, id) {
  setNodes((ns) =>
    ns.map((n) =>
      n.id === id
        ? { ...n, data: { ...clearEditFlags(n.data), editing: true } }
        : { ...n, data: clearEditFlags(n.data) },
    ),
  );
}

function startDescEdit(setNodes, id) {
  setNodes((ns) =>
    ns.map((n) =>
      n.id === id
        ? { ...n, data: { ...clearEditFlags(n.data), editingDesc: true } }
        : { ...n, data: clearEditFlags(n.data) },
    ),
  );
}

function EditableTitle({ id, label, editing, readOnly, placeholder }) {
  const { setNodes } = useReactFlow();
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(
    (value) => {
      const next = String(value ?? '').trim() || label || placeholder || 'Nó';
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? { ...n, data: { ...clearEditFlags(n.data), label: next } }
            : n,
        ),
      );
    },
    [id, label, placeholder, setNodes],
  );

  const cancel = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: clearEditFlags(n.data) } : n)),
    );
  }, [id, setNodes]);

  if (editing && !readOnly) {
    return (
      <input
        ref={inputRef}
        className="ec-xy-node__title-input nodrag nopan"
        defaultValue={label || ''}
        aria-label="Título do nó"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
      />
    );
  }

  return (
    <div
      className="ec-xy-node__title nodrag nopan"
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? -1 : 0}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        startLabelEdit(setNodes, id);
      }}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          startLabelEdit(setNodes, id);
        }
      }}
    >
      {label || placeholder}
    </div>
  );
}

function EditableDescription({ id, description, editing, readOnly, selected }) {
  const { setNodes } = useReactFlow();
  const areaRef = useRef(null);

  useEffect(() => {
    if (editing && areaRef.current) {
      areaRef.current.focus();
      areaRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(
    (value) => {
      const next = String(value ?? '').trim();
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? { ...n, data: { ...clearEditFlags(n.data), description: next } }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const cancel = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: clearEditFlags(n.data) } : n)),
    );
  }, [id, setNodes]);

  if (editing && !readOnly) {
    return (
      <textarea
        ref={areaRef}
        className="ec-xy-node__desc-input nodrag nopan"
        defaultValue={description || ''}
        rows={2}
        aria-label="Texto abaixo do título"
        placeholder="Texto abaixo do título…"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
      />
    );
  }

  if (description) {
    return (
      <div
        className="ec-xy-node__desc nodrag nopan"
        role={readOnly ? undefined : 'button'}
        tabIndex={readOnly ? -1 : 0}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          startDescEdit(setNodes, id);
        }}
        onKeyDown={(e) => {
          if (readOnly) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            startDescEdit(setNodes, id);
          }
        }}
      >
        {description}
      </div>
    );
  }

  if (!readOnly) {
    return (
      <button
        type="button"
        className="ec-xy-node__desc-add nodrag nopan"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          startDescEdit(setNodes, id);
        }}
      >
        + texto abaixo
      </button>
    );
  }

  return null;
}

function NodeToolbarActions({ id, data, readOnly, selected }) {
  const { setNodes, setEdges, deleteElements, getNode } = useReactFlow();
  const fileRef = useRef(null);

  const updateLabel = useCallback(() => {
    if (readOnly) return;
    startLabelEdit(setNodes, id);
  }, [id, readOnly, setNodes]);

  const updateDesc = useCallback(() => {
    if (readOnly) return;
    startDescEdit(setNodes, id);
  }, [id, readOnly, setNodes]);

  const pickImage = useCallback(() => {
    if (readOnly) return;
    fileRef.current?.click();
  }, [readOnly]);

  const onFile = useCallback(
    (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) return;
      if (file.size > MAX_NODE_IMAGE_BYTES) return;
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = typeof reader.result === 'string' ? reader.result : '';
        if (!imageData) return;
        applyImageToNode(setNodes, id, file, imageData);
      };
      reader.readAsDataURL(file);
    },
    [id, setNodes],
  );

  const toggleAnimateConnected = useCallback(() => {
    if (readOnly) return;
    setEdges((eds) =>
      eds.map((e) =>
        e.source === id || e.target === id ? { ...e, animated: !e.animated } : e,
      ),
    );
  }, [id, readOnly, setEdges]);

  const duplicate = useCallback(() => {
    if (readOnly) return;
    const node = getNode(id);
    if (!node) return;
    const newId = `${node.id}-copy-${Date.now().toString(36).slice(-4)}`;
    setNodes((ns) =>
      ns.concat({
        ...node,
        id: newId,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        selected: false,
        data: clearEditFlags(node.data),
      }),
    );
  }, [getNode, id, readOnly, setNodes]);

  const remove = useCallback(() => {
    if (readOnly) return;
    deleteElements({ nodes: [{ id }] });
  }, [deleteElements, id, readOnly]);

  if (readOnly) return null;

  const hasImage = !!(data?.image?.url || data?.imageData);

  return (
    <NodeToolbar
      isVisible={!!selected}
      className="ec-xy-node-toolbar"
      position={Position.Top}
      offset={10}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="ec-xy-node__file nodrag nopan"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Editar título"
        aria-label="Editar título"
        onClick={updateLabel}
      >
        Título
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Texto abaixo do título"
        aria-label="Texto abaixo do título"
        onClick={updateDesc}
      >
        Texto
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip={hasImage ? 'Trocar imagem (ou Ctrl+V)' : 'Adicionar / colar imagem (Ctrl+V)'}
        aria-label={hasImage ? 'Trocar imagem' : 'Adicionar ou colar imagem'}
        onClick={pickImage}
      >
        Img
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Alternar animação das ligações"
        aria-label="Alternar animação das ligações"
        onClick={toggleAnimateConnected}
      >
        Animar
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn nodrag nopan"
        data-tip="Duplicar nó"
        aria-label="Duplicar nó"
        onClick={duplicate}
      >
        Dup
      </button>
      <button
        type="button"
        className="ec-xy-tb-btn ec-xy-tb-btn--danger nodrag nopan"
        data-tip="Apagar nó"
        aria-label="Apagar nó"
        onClick={remove}
      >
        Apagar
      </button>
    </NodeToolbar>
  );
}

function NodeShell({ id, data, selected, className, children, readOnly, dragging }) {
  const bg = data?.color || undefined;
  const color = data?.fontColor || undefined;
  const editing = !!(data?.editing || data?.editingDesc);
  const hasImage = !!(data?.image?.url || data?.imageData);
  const dims = useNodeDimensions(id);
  /* No arraste: some chrome (prop dragging do RF). CSS .is-interacting cobre pan. */
  const showChrome = selected && !readOnly && !dragging;
  const shellStyle = {
    background: bg || undefined,
    color: color || undefined,
    ...(dragging && dims?.width ? { width: dims.width, minWidth: dims.width } : {}),
    ...(dragging && dims?.height ? { height: dims.height, minHeight: dims.height } : {}),
  };
  return (
    <>
      {showChrome ? (
        <NodeResizer
          minWidth={hasImage ? 80 : 120}
          minHeight={hasImage ? 72 : 44}
          maxWidth={2400}
          maxHeight={3200}
          isVisible
          keepAspectRatio={false}
          lineClassName="ec-xy-resize-line"
          handleClassName="ec-xy-resize-handle"
        />
      ) : null}
      {showChrome ? (
        <NodeToolbarActions id={id} data={data} readOnly={readOnly} selected={selected} />
      ) : null}
      <div
        className={`ec-xy-node ${className || ''}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${data?.intersecting ? ' is-intersecting' : ''}${editing ? ' is-editing' : ''}${hasImage ? ' has-image' : ''}`}
        style={shellStyle}
      >
        <EasyHandles />
        <div className="ec-xy-node__body">{children}</div>
      </div>
    </>
  );
}

/** Título + texto abaixo + imagem no final */
function NodeBody({ id, data, readOnly, selected, titlePlaceholder }) {
  const imageUrl = data?.image?.url || '';
  const imageData = data?.imageData || '';
  const src = imageUrl || imageData;
  const { setNodes, getNode } = useReactFlow();
  const fileRef = useRef(null);
  const [imgOpen, setImgOpen] = useState(() => !!src);
  const showImageOpen = readOnly || imgOpen;

  const persistNodeSize = useCallback(() => {
    requestAnimationFrame(() => {
      const node = getNode(id);
      if (!node) return;
      if (node.style?.height && node.style?.width) return;
      let domRect = null;
      try {
        const el = document.querySelector(
          `.react-flow__node[data-id="${CSS.escape(String(id))}"]`,
        );
        if (el) domRect = el.getBoundingClientRect();
      } catch (_) {}
      const frozen = freezeNodeDimensions(node, domRect);
      if (frozen === node) return;
      setNodes((ns) => ns.map((n) => (n.id === id ? frozen : n)));
    });
  }, [getNode, id, setNodes]);

  useEffect(() => {
    if (src) setImgOpen(true);
    else setImgOpen(false);
  }, [src]);

  const applyImageFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      if (file.size > MAX_NODE_IMAGE_BYTES) return;
      const reader = new FileReader();
      reader.onload = () => {
        const nextData = typeof reader.result === 'string' ? reader.result : '';
        if (!nextData) return;
        setImgOpen(true);
        applyImageToNode(setNodes, id, file, nextData);
      };
      reader.readAsDataURL(file);
    },
    [id, setNodes],
  );

  const onFile = useCallback(
    (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      applyImageFile(file);
    },
    [applyImageFile],
  );

  const removeImg = useCallback(() => {
    askRemoveImageConfirm().then((ok) => {
      if (!ok) return;
      setImgOpen(false);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, imageData: '', image: null } } : n,
        ),
      );
    });
  }, [id, setNodes]);

  return (
    <>
      <EditableTitle
        id={id}
        label={data?.label}
        editing={!!data?.editing}
        readOnly={readOnly}
        placeholder={titlePlaceholder}
      />
      <EditableDescription
        id={id}
        description={data?.description}
        editing={!!data?.editingDesc}
        readOnly={readOnly}
        selected={selected}
      />
      {src ? (
        <div
          className={`ec-xy-node__img-panel nodrag nopan${showImageOpen ? ' is-open' : ''}${readOnly ? ' is-readonly' : ''}`}
        >
          {!readOnly ? (
            <button
              type="button"
              className="ec-xy-node__img-toggle nodrag nopan"
              aria-expanded={showImageOpen}
              aria-label={showImageOpen ? 'Ocultar imagem' : 'Mostrar imagem'}
              title={showImageOpen ? 'Ocultar imagem' : 'Mostrar imagem'}
              onClick={(e) => {
                e.stopPropagation();
                setImgOpen((v) => !v);
              }}
            >
              <span className="ec-xy-node__img-toggle-label">
                {showImageOpen ? 'Ocultar imagem' : 'Ver imagem'}
              </span>
              <svg
                className="ec-xy-node__img-toggle-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          ) : null}
          {showImageOpen ? (
            <>
              <div className="ec-xy-node__img-wrap">
                <AuthAwareImage
                  src={imageUrl || imageData}
                  fallbackData={imageData}
                  nodeId={id}
                  onLoad={persistNodeSize}
                />
              </div>
              {!readOnly && selected ? (
                <div className="ec-xy-node__img-actions">
                  <button
                    type="button"
                    className="ec-xy-tb-btn nodrag nopan"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    className="ec-xy-tb-btn ec-xy-tb-btn--danger nodrag nopan"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImg();
                    }}
                  >
                    Remover
                  </button>
                </div>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="ec-xy-node__file"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
                onClick={(e) => e.stopPropagation()}
              />
            </>
          ) : (
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="ec-xy-node__file"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onFile}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : !readOnly && selected ? (
        <button
          type="button"
          className="ec-xy-node__img-add"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          title="Ou cole com Ctrl+V"
        >
          + imagem (ou Ctrl+V)
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="ec-xy-node__file nodrag nopan"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFile}
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      ) : (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="ec-xy-node__file"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </>
  );
}

export const CenterNode = memo(function CenterNode({ id, data, selected, dragging }) {
  const readOnly = !!data?.readOnly;
  return (
    <NodeShell id={id} data={data} selected={selected} dragging={dragging} className="ec-xy-node--center" readOnly={readOnly}>
      <NodeBody id={id} data={data} readOnly={readOnly} selected={selected} titlePlaceholder="Centro" />
    </NodeShell>
  );
}, nodePropsAreEqual);

export const BranchNode = memo(function BranchNode({ id, data, selected, dragging }) {
  const readOnly = !!data?.readOnly;
  return (
    <NodeShell id={id} data={data} selected={selected} dragging={dragging} className="ec-xy-node--branch" readOnly={readOnly}>
      <NodeBody id={id} data={data} readOnly={readOnly} selected={selected} titlePlaceholder="Nó" />
    </NodeShell>
  );
}, nodePropsAreEqual);

export const BalloonNode = memo(function BalloonNode({ id, data, selected, dragging }) {
  const readOnly = !!data?.readOnly;
  return (
    <NodeShell id={id} data={data} selected={selected} dragging={dragging} className="ec-xy-node--balloon" readOnly={readOnly}>
      <NodeBody id={id} data={data} readOnly={readOnly} selected={selected} titlePlaceholder="Texto" />
    </NodeShell>
  );
}, nodePropsAreEqual);

export const nodeTypes = {
  center: CenterNode,
  branch: BranchNode,
  balloon: BalloonNode,
};
