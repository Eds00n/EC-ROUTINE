import React from 'react';
import { createRoot } from 'react-dom/client';
import MentalFlowApp from './MentalFlowApp.jsx';
import '@xyflow/react/dist/style.css';
import './mental-xyflow.css';

let root = null;
let hostEl = null;
let apiRef = null;

function addNode(opts) {
  return apiRef && apiRef.addNode ? apiRef.addNode(opts) : null;
}

function setCanvasBg(color) {
  if (apiRef && apiRef.setCanvasBg) apiRef.setCanvasBg(color);
}

function fitView() {
  if (apiRef && apiRef.fitView) apiRef.fitView();
}

function getData() {
  return apiRef && apiRef.getData ? apiRef.getData() : null;
}

function applyMentalNodeImages(nodes) {
  if (apiRef && typeof apiRef.applyMentalNodeImages === 'function') {
    apiRef.applyMentalNodeImages(nodes);
  }
}

function mount(el, options = {}) {
  if (!el) return null;
  unmount();
  hostEl = el;
  el.hidden = false;
  el.style.pointerEvents = 'auto';
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.zIndex = '5';

  const canvas =
    el.closest('#annotationMentalCanvas') || document.getElementById('annotationMentalCanvas');
  if (canvas) canvas.style.pointerEvents = 'auto';

  root = createRoot(el);
  const payload =
    options.data && typeof options.data === 'object'
      ? options.data
      : { nodes: [], edges: [] };

  root.render(
    <MentalFlowApp
      initialPayload={payload}
      readOnly={!!options.readOnly}
      canvasBg={options.canvasBg || payload.canvasBg}
      onReady={(api) => {
        if (api) apiRef = api;
      }}
      confirmDelete={options.confirmDelete}
    />,
  );

  return { getData, addNode, setCanvasBg, fitView, applyMentalNodeImages };
}

function unmount() {
  if (root) {
    root.unmount();
    root = null;
  }
  apiRef = null;
  if (hostEl) {
    hostEl.innerHTML = '';
    hostEl.style.pointerEvents = '';
    hostEl = null;
  }
  const canvas = document.getElementById('annotationMentalCanvas');
  if (canvas) canvas.style.pointerEvents = '';
}

const EcMentalXyflow = { mount, unmount, getData, addNode, setCanvasBg, fitView, applyMentalNodeImages };
export default EcMentalXyflow;

if (typeof window !== 'undefined') {
  window.EcMentalXyflow = EcMentalXyflow;
}
