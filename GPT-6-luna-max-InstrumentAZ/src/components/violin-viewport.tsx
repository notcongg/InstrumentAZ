"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Box,
  CircleDot,
  Crosshair,
  Grid2X2,
  Maximize,
  Minus,
  Move3D,
  Plus,
  RotateCcw,
  ScanLine,
} from "lucide-react";

type ViolinViewportProps = {
  selectedPartId: string;
  onSelectPart: (partId: string) => void;
  bodyLengthMm: number;
  bodyWidthMm: number;
};

type PartShapeProps = {
  partId: string;
  label: string;
  selectedPartId: string;
  onSelectPart: (partId: string) => void;
  className?: string;
  children: React.ReactNode;
};

function PartShape({ partId, label, selectedPartId, onSelectPart, className = "", children }: PartShapeProps) {
  const selected = selectedPartId === partId;
  return (
    <g
      data-part={partId}
      className={`violin-part ${selected ? "is-selected" : ""} ${className}`}
      role="button"
      tabIndex={0}
      aria-label={`Select ${label}`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelectPart(partId);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelectPart(partId);
        }
      }}
    >
      {children}
    </g>
  );
}

export function ViolinViewport({ selectedPartId, onSelectPart, bodyLengthMm, bodyWidthMm }: ViolinViewportProps) {
  const [gridVisible, setGridVisible] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [view, setView] = useState<"front" | "iso">("iso");
  const [zoom, setZoom] = useState(1);
  const [orbit, setOrbit] = useState({ x: 0, y: -3 });
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, [data-part]")) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOrbit((current) => ({ x: Math.max(-24, Math.min(24, current.x + dx * 0.16)), y: Math.max(-18, Math.min(18, current.y + dy * 0.12)) }));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom((current) => Math.max(0.7, Math.min(1.4, current - Math.sign(event.deltaY) * 0.045)));
  }

  const lengthScale = bodyLengthMm / 356;
  const widthScale = bodyWidthMm / 208;

  return (
    <section className="viewport-shell" aria-label="Violin design preview">
      <div className="viewport-toolbar">
        <div className="viewport-toolbar-group">
          <span className="toolbar-caption">VIEW</span>
          <button className={`tool-button ${view === "front" ? "tool-button-active" : ""}`} onClick={() => setView("front")} aria-pressed={view === "front"} title="Front elevation sketch">
            <Box size={15} /> <span>Front</span>
          </button>
          <button className={`tool-button ${view === "iso" ? "tool-button-active" : ""}`} onClick={() => setView("iso")} aria-pressed={view === "iso"} title="Isometric preview, not a 3D CAD view">
            <Move3D size={15} /> <span>Iso preview</span>
          </button>
          <i className="toolbar-divider" />
          <button className={`tool-icon-button ${gridVisible ? "tool-button-active" : ""}`} onClick={() => setGridVisible((value) => !value)} aria-label={gridVisible ? "Hide grid" : "Show grid"} title="Toggle reference grid">
            <Grid2X2 size={16} />
          </button>
          <button className={`tool-icon-button ${wireframe ? "tool-button-active" : ""}`} onClick={() => setWireframe((value) => !value)} aria-label={wireframe ? "Show shaded preview" : "Show edge preview"} title={wireframe ? "Shaded preview" : "Edge preview"}>
            <ScanLine size={16} />
          </button>
        </div>
        <div className="viewport-toolbar-group viewport-camera-group">
          <span className="camera-readout"><CircleDot size={13} /> {Math.round(orbit.x)}° / {Math.round(orbit.y)}°</span>
          <i className="toolbar-divider" />
          <button className="tool-icon-button" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} aria-label="Zoom out" title="Zoom out"><Minus size={15} /></button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button className="tool-icon-button" onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))} aria-label="Zoom in" title="Zoom in"><Plus size={15} /></button>
          <button className="tool-icon-button" onClick={() => { setZoom(1); setOrbit({ x: 0, y: -3 }); }} aria-label="Reset preview camera" title="Fit / reset preview"><Maximize size={15} /></button>
        </div>
      </div>

      <div className={`viewport-canvas ${gridVisible ? "viewport-grid" : ""}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel}>
        <div className="canvas-axis-label axis-y">Y</div>
        <div className="canvas-axis-label axis-x">X</div>
        <div className="viewport-axis axis-horizontal" />
        <div className="viewport-axis axis-vertical" />
        <div className={`dimension-tag dimension-tag-body ${selectedPartId === "body" ? "dimension-tag-active" : ""}`}>
          <span className="dimension-line" />
          <span>BODY · {bodyLengthMm.toFixed(1)} mm</span>
        </div>
        <div className="dimension-tag dimension-tag-bridge"><span>NECK / BODY JOINT</span><i /></div>
        <div className="viewport-model-wrap" style={{ transform: `perspective(1050px) rotateX(${view === "iso" ? 8 + orbit.y * 0.4 : 0}deg) rotateY(${view === "iso" ? orbit.x * 0.45 : 0}deg) rotateZ(${view === "iso" ? orbit.x * 0.12 : 0}deg) scale(${zoom})` }}>
          <svg className={`violin-svg ${wireframe ? "violin-wireframe" : ""}`} viewBox="0 0 700 720" role="img" aria-label="Editable parametric violin silhouette preview">
            <defs>
              <linearGradient id="wood-main" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#dc9b58" />
                <stop offset="46%" stopColor="#bd713c" />
                <stop offset="100%" stopColor="#783d28" />
              </linearGradient>
              <linearGradient id="wood-rib" x1="0" x2="0.9" y1="0" y2="1">
                <stop offset="0%" stopColor="#83462f" />
                <stop offset="50%" stopColor="#b5693a" />
                <stop offset="100%" stopColor="#63382b" />
              </linearGradient>
              <linearGradient id="ebony" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#181719" />
                <stop offset="52%" stopColor="#36302e" />
                <stop offset="100%" stopColor="#171719" />
              </linearGradient>
              <radialGradient id="plate-glow" cx="38%" cy="22%" r="80%">
                <stop offset="0%" stopColor="#f8c783" stopOpacity=".45" />
                <stop offset="100%" stopColor="#6b3d2b" stopOpacity=".03" />
              </radialGradient>
              <filter id="instrument-shadow" x="-40%" y="-20%" width="180%" height="160%">
                <feDropShadow dx="13" dy="22" stdDeviation="15" floodColor="#070809" floodOpacity=".42" />
              </filter>
            </defs>
            <g transform={`translate(350 208) scale(${widthScale} ${lengthScale}) translate(-350 -208)`}>
              <PartShape partId="body" label="Body assembly" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-body">
                <path d="M350 211 C325 218 296 221 272 226 C244 231 219 240 207 259 C192 282 203 305 218 333 C234 363 246 378 232 403 C218 430 201 455 208 491 C216 535 270 579 329 611 C341 618 347 621 350 622 C353 621 359 618 371 611 C430 579 484 535 492 491 C499 455 482 430 468 403 C454 378 466 363 482 333 C497 305 508 282 493 259 C481 240 456 231 428 226 C404 221 375 218 350 211 Z" fill="url(#wood-rib)" transform="translate(0 9)" filter="url(#instrument-shadow)" />
                <path d="M350 211 C325 218 296 221 272 226 C244 231 219 240 207 259 C192 282 203 305 218 333 C234 363 246 378 232 403 C218 430 201 455 208 491 C216 535 270 579 329 611 C341 618 347 621 350 622 C353 621 359 618 371 611 C430 579 484 535 492 491 C499 455 482 430 468 403 C454 378 466 363 482 333 C497 305 508 282 493 259 C481 240 456 231 428 226 C404 221 375 218 350 211 Z" fill="url(#wood-main)" stroke="#e7af70" strokeWidth="2" />
                <path d="M350 224 C327 231 299 233 276 239 C250 245 230 252 220 269 C207 290 218 310 231 336 C246 366 255 380 243 404 C230 429 214 455 220 487 C227 525 277 566 332 597 C342 603 348 606 350 607 C352 606 358 603 368 597 C423 566 473 525 480 487 C486 455 470 429 457 404 C445 380 454 366 469 336 C482 310 493 290 480 269 C470 252 450 245 424 239 C401 233 373 231 350 224 Z" fill="url(#plate-glow)" stroke="#efbd7c" strokeOpacity=".62" strokeWidth="1.5" />
                <path d="M227 275 C254 254 294 248 330 247 M473 275 C446 254 406 248 370 247 M223 477 C246 514 284 542 330 569 M477 477 C454 514 416 542 370 569" fill="none" stroke="#f1c38c" strokeOpacity=".23" strokeWidth="2" />
              </PartShape>

              <PartShape partId="top-plate" label="Top plate" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-top-plate">
                <path d="M350 224 C327 231 299 233 276 239 C250 245 230 252 220 269 C207 290 218 310 231 336 C246 366 255 380 243 404 C230 429 214 455 220 487 C227 525 277 566 332 597 C342 603 348 606 350 607 C352 606 358 603 368 597 C423 566 473 525 480 487 C486 455 470 429 457 404 C445 380 454 366 469 336 C482 310 493 290 480 269 C470 252 450 245 424 239 C401 233 373 231 350 224 Z" fill="transparent" stroke="transparent" strokeWidth="3" />
              </PartShape>

              <PartShape partId="f-holes" label="F-holes" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-fholes">
                <path d="M286 355 C276 342 276 328 283 319 C289 311 300 315 301 326 C302 336 294 343 291 354 C288 364 291 371 288 379 M414 355 C424 342 424 328 417 319 C411 311 400 315 399 326 C398 336 406 343 409 354 C412 364 409 371 412 379" fill="none" stroke="#47251f" strokeWidth="6" strokeLinecap="round" />
                <path d="M284 319 l-5 -9 M417 319 l5 -9 M287 379 l-1 8 M413 379 l1 8" fill="none" stroke="#47251f" strokeWidth="4" strokeLinecap="round" />
              </PartShape>

              <PartShape partId="soundpost" label="Soundpost (projected position)" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-soundpost">
                <circle cx="377" cy="401" r="8" fill="#d6a263" fillOpacity=".24" stroke="#f4cb89" strokeWidth="2" strokeDasharray="3 3" />
              </PartShape>

              <PartShape partId="bridge" label="Bridge" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-bridge">
                <path d="M307 411 Q350 401 393 411 L387 425 Q350 432 313 425 Z" fill="#e7c08b" stroke="#684732" strokeWidth="2" />
                <path d="M314 423 L312 437 M386 423 L388 437" stroke="#a0754f" strokeWidth="3" />
              </PartShape>
            </g>

            <PartShape partId="neck" label="Neck" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-neck">
              <path d="M326 174 Q350 163 374 174 L388 262 Q350 277 312 262 Z" fill="url(#wood-rib)" stroke="#bd8758" strokeWidth="1.4" />
            </PartShape>
            <PartShape partId="fingerboard" label="Fingerboard" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-fingerboard">
              <path d="M326 107 Q350 100 374 107 L387 285 Q350 296 313 285 Z" fill="url(#ebony)" stroke="#60514a" strokeWidth="1.3" />
              <path d="M332 122 L339 279 M350 118 L350 286 M368 122 L361 279" stroke="#947c60" strokeOpacity=".52" strokeWidth=".9" />
            </PartShape>
            <PartShape partId="strings" label="Strings" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-strings">
              <path d="M337 83 C338 205 338 383 339 524 M346 82 C347 205 347 382 347 526 M354 82 C353 205 353 382 353 526 M363 83 C362 205 362 383 361 524" fill="none" stroke="#e6ddc6" strokeWidth="1.55" strokeOpacity=".9" />
            </PartShape>
            <PartShape partId="tailpiece" label="Tailpiece" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-tailpiece">
              <path d="M333 438 Q350 432 367 438 L380 516 Q350 539 320 516 Z" fill="url(#ebony)" stroke="#79685b" strokeWidth="1.5" />
              <path d="M337 446 L345 509 M350 444 L350 515 M363 446 L355 509" stroke="#a78d72" strokeWidth="1" strokeOpacity=".55" />
            </PartShape>
            <PartShape partId="pegs" label="Tuning pegs" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-pegs">
              <circle cx="318" cy="135" r="8" fill="#292324" stroke="#b88651" strokeWidth="1.8" />
              <circle cx="382" cy="151" r="8" fill="#292324" stroke="#b88651" strokeWidth="1.8" />
              <circle cx="318" cy="165" r="8" fill="#292324" stroke="#b88651" strokeWidth="1.8" />
              <circle cx="382" cy="181" r="8" fill="#292324" stroke="#b88651" strokeWidth="1.8" />
            </PartShape>
            <PartShape partId="scroll" label="Scroll" selectedPartId={selectedPartId} onSelectPart={onSelectPart} className="part-scroll">
              <path d="M336 75 C332 65 336 50 348 46 C362 41 377 50 377 63 C377 74 368 81 357 81 C348 81 343 76 344 69 C345 61 354 58 360 62 C365 65 363 71 359 72" fill="none" stroke="#bd8051" strokeWidth="12" strokeLinecap="round" />
              <path d="M336 75 C332 65 336 50 348 46 C362 41 377 50 377 63 C377 74 368 81 357 81 C348 81 343 76 344 69 C345 61 354 58 360 62 C365 65 363 71 359 72" fill="none" stroke="#e1a969" strokeWidth="1.6" strokeLinecap="round" />
            </PartShape>
          </svg>
        </div>

        <div className="orientation-cube" aria-label="Front view orientation indicator">
          <div className="orientation-cube-top" />
          <div className="orientation-cube-face">F</div>
          <span>FRONT</span>
        </div>
        <div className="canvas-legend"><span className="legend-dot legend-selected" /> Selected <span className="legend-divider" /> <span className="legend-dot legend-defined" /> Defined reference</div>
        <div className="viewport-disclaimer"><span className="disclaimer-orbit"><RotateCcw size={12} /> Drag to orbit · scroll to zoom</span><span className="preview-status"><Crosshair size={12} /> SVG preview · not to scale · no CAD kernel</span></div>
      </div>
      <div className="viewport-footer">
        <span><span className="online-dot" /> Design preview ready</span>
        <span>Units: mm <i /> {bodyLengthMm.toFixed(1)} × {bodyWidthMm.toFixed(1)} mm envelope</span>
        <span>Approximate illustration <i /> No manufacturing geometry</span>
      </div>
    </section>
  );
}
