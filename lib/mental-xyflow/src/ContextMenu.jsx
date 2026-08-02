import React from 'react';

export default function ContextMenu({
  id,
  top,
  left,
  right,
  bottom,
  onClick,
  onDuplicate,
  onDelete,
  onEdit,
  onEditDesc,
  onAnimate,
  canDelete,
}) {
  return (
    <div
      className="ec-xy-context-menu"
      style={{ top: top || undefined, left: left || undefined, right: right || undefined, bottom: bottom || undefined }}
      role="menu"
    >
      <button type="button" role="menuitem" onClick={() => { onEdit?.(id); onClick?.(); }}>
        Editar título
      </button>
      <button type="button" role="menuitem" onClick={() => { onEditDesc?.(id); onClick?.(); }}>
        Texto abaixo
      </button>
      <button type="button" role="menuitem" onClick={() => { onAnimate?.(id); onClick?.(); }}>
        Alternar animação
      </button>
      <button type="button" role="menuitem" onClick={() => { onDuplicate?.(id); onClick?.(); }}>
        Duplicar
      </button>
      {canDelete ? (
        <button
          type="button"
          role="menuitem"
          className="ec-xy-context-menu__danger"
          onClick={() => { onDelete?.(id); onClick?.(); }}
        >
          Apagar
        </button>
      ) : null}
    </div>
  );
}
