// ==UserScript==
// @name         Survev.io Aimbot, ESP & X-Ray (Sample)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @author       Adapted from Zertalious
// @match        *://survev.io/*
// @match        *://surviv.io/*
// @icon         https://survev.io/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('Survev.io mod loaded');  // Confirm script runs

    let espEnabled = true;
    let aimbotEnabled = true;
    let xrayEnabled = true;
    const seenTextureIds = new Set();
    const loadoutMinSize = 20;  // minimum rendered size to treat as a player
    const loadoutMaxSize = 480;  // ignore overly large draws (UI/worldmap)
    const loadoutScaleMin = 0.2;  // ignore super tiny off-screen/minimap transforms
    const loadoutScaleMax = 3.2;  // allow zoom/respawn zoom while filtering UI
    const edgeMarginRatio = 0.05;  // ignore icons hugging the HUD edges
    const maxOrthoDeviation = 0.8;  // dot-product tolerance; higher = more rotation allowed
    const minUniformScaleRatio = 0.2;  // keep extreme shears from HUD elements



    // X-Ray: Invalidate ceiling textures
    Object.defineProperty(Object.prototype, 'textureCacheIds', {
        configurable: true,
        set(value) {
            console.log('textureCacheIds set:', value);  // Add this to debug
            this._textureCacheIds = value;
            if (Array.isArray(value)) {
                const scope = this;
                value.push = new Proxy(value.push, {
                    apply(target, thisArgs, args) {
                        const name = String(args[0]);
                        if (!seenTextureIds.has(name)) {
                            seenTextureIds.add(name);
                            console.log('[textureCacheId]', name);
                        }
                        if (name.indexOf('ceiling') > -1 || name.indexOf('tree') > -1 || name.indexOf('bush') > -1) {
                            Object.defineProperty(scope, 'valid', {
                                set(v) { this._valid = v; },
                                get() { return xrayEnabled ? false : this._valid; }
                            });
                        }
                        return Reflect.apply(...arguments);
                    }
                });
            }
        },
        get() { return this._textureCacheIds; }
    });

    // Block WebGL (game uses Canvas2D)
    const params = { get() { return null; } };
    Object.defineProperty(window, 'WebGLRenderingContext', params);
    Object.defineProperty(window, 'WebGL2RenderingContext', params);

    let ctx;

    // Hook canvas context
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
        apply(target, thisArgs, args) {
            const result = Reflect.apply(...arguments);
            if (thisArgs.parentNode) {
                ctx = result;
            }
            return result;
        }
    });

    const players = [];
    const playerSeen = new Set();  // per-frame dedupe
    let radius;
    let mouseX = 0, mouseY = 0;

    // Track real mouse
    window.addEventListener('mousemove', e => {
        if (e.dispatchedByMe !== true) {
            mouseX = e.clientX;
            mouseY = e.clientY;
        }
    });

    // Toggles
    window.addEventListener('keyup', e => {
        switch (String.fromCharCode(e.keyCode)) {
            case 'N': espEnabled = !espEnabled; break;
            case 'B': aimbotEnabled = !aimbotEnabled; break;
            case 'H': xrayEnabled = !xrayEnabled; break;
        }
    });

    // Hook drawImage for player loadout sprites (detect enemies)
    const Context2D = CanvasRenderingContext2D.prototype;
    Context2D.drawImage = new Proxy(Context2D.drawImage, {
        apply(target, thisArgs, args) {
            // Detect player draw: loadout images (width/height may change with updates)
            if (aimbotEnabled && args[0]?.src?.indexOf('loadout') > -1) {
                const { a, b, c, d, e, f } = thisArgs.getTransform();
                const scaleX = Math.hypot(a, b);
                const scaleY = Math.hypot(c, d);
                const maxScale = Math.max(scaleX, scaleY);
                const minScale = Math.min(scaleX, scaleY);
                const orthoDot = Math.abs((a * c + b * d) / ((scaleX * scaleY) + 1e-6));  // 0 = pure rotation/scale, >0 implies shear
                const drawnW = args[8] ?? args[3] ?? args[0].width ?? 0;
                const drawnH = args[7] ?? args[4] ?? args[0].height ?? 0;
                const baseSize = Math.max(
                    drawnW,
                    drawnH,
                    args[0]?.naturalHeight ?? 0,
                    args[0]?.naturalWidth ?? 0,
                    args[0]?.height ?? 0,
                    args[0]?.width ?? 0
                ) || 30;
                const renderSize = baseSize * (Number.isFinite(maxScale) ? maxScale : 1);
                const visibleAlpha = thisArgs.globalAlpha ?? 1;

                if (visibleAlpha < 0.05) return Reflect.apply(...arguments);  // ignore hidden UI fades
                if (renderSize < loadoutMinSize || renderSize > loadoutMaxSize) return Reflect.apply(...arguments);  // skip UI/inventory icons
                if (maxScale < loadoutScaleMin || maxScale > loadoutScaleMax) return Reflect.apply(...arguments);  // skip off-scale draws
                if (minScale / (maxScale + 1e-6) < minUniformScaleRatio) return Reflect.apply(...arguments);  // skip stretched HUD renders
                if (orthoDot > maxOrthoDeviation) return Reflect.apply(...arguments);  // skip heavily sheared UI draws

                const hitRadius = renderSize * 0.6 + 4;
                const centerX = thisArgs.canvas.width / 2;
                const centerY = thisArgs.canvas.height / 2;
                const marginX = thisArgs.canvas.width * edgeMarginRatio;
                const marginY = thisArgs.canvas.height * edgeMarginRatio;
                const insidePlayArea = e > marginX && e < thisArgs.canvas.width - marginX && f > marginY && f < thisArgs.canvas.height - marginY;
                const notSelf = Math.hypot(e - centerX, f - centerY) > renderSize * 0.05;

                if (insidePlayArea && notSelf && Number.isFinite(hitRadius)) {
                    const key = `${Math.round(e / 4) * 4}:${Math.round(f / 4) * 4}`;  // allow slight rotation wiggle without duping
                    if (!playerSeen.has(key)) {
                        playerSeen.add(key);
                        players.push({ x: e, y: f, radius: hitRadius });
                    }
                }
            }
            return Reflect.apply(...arguments);
        }
    });

    // Hook RAF for ESP/Aimbot overlay
    window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
        apply(target, thisArgs, args) {
            args[0] = new Proxy(args[0], {
                apply(target, thisArgs, args) {
                    players.length = 0;  // Clear prev frame
                    playerSeen.clear();
                    Reflect.apply(...arguments);  // Call original RAF

                    if (!ctx || !ctx.canvas) return;  // Canvas not ready yet

                    // Overlay UI
                    ctx.fillStyle = '#fff';
                    const toggles = [
                        ['[B] Aimbot', aimbotEnabled],
                        ['[N] ESP', espEnabled],
                        ['[H] X-Ray', xrayEnabled],
                    ];
                    const fontSize = 20;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.font = `bolder ${fontSize}px monospace`;
                    for (let i = 0; i < toggles.length; i++) {
                        const [text, status] = toggles[i];
                        ctx.globalAlpha = status ? 1 : 0.5;
                        ctx.fillText(`${text}: ${status ? 'ON' : 'OFF'}`, ctx.canvas.width / 2, 10 + i * fontSize);
                    }
                    ctx.globalAlpha = 1;

                    if (players.length === 0) return;

                    ctx.lineWidth = 5;
                    ctx.strokeStyle = 'red';

                    // ESP: Lines to players
                    if (espEnabled) {
                        const centerX = ctx.canvas.width / 2;
                        const centerY = ctx.canvas.height / 2;
                        ctx.beginPath();
                        for (let player of players) {
                            ctx.moveTo(centerX, centerY);
                            ctx.lineTo(player.x, player.y);
                        }
                        ctx.stroke();
                    }

                    // Aimbot: Aim at closest
                    if (aimbotEnabled) {
                        let minDist = Infinity;
                        let target = null;
                        for (let player of players) {
                            const dist = Math.hypot(player.x - mouseX, player.y - mouseY);
                            if (dist < minDist) {
                                minDist = dist;
                                target = player;
                            }
                        }
                        if (target) {
                            // Highlight target with body + arm markers (matches player silhouette better)
                            const bodyR = target.radius || radius || 30;
                            const armR = bodyR * 0.35;
                            const armOffsetX = bodyR * 0.6;
                            const armOffsetY = bodyR * 0.45;
                            ctx.beginPath();
                            ctx.arc(target.x, target.y, bodyR, 0, Math.PI * 2);
                            ctx.moveTo(target.x + armOffsetX + armR, target.y - armOffsetY);
                            ctx.arc(target.x + armOffsetX, target.y - armOffsetY, armR, 0, Math.PI * 2);
                            ctx.moveTo(target.x - armOffsetX + armR, target.y - armOffsetY);
                            ctx.arc(target.x - armOffsetX, target.y - armOffsetY, armR, 0, Math.PI * 2);
                            ctx.stroke();

                            // Simulate mouse move to aim (dispatch on canvas to hit pointer-locked handlers)
                            const aimEvent = new MouseEvent('mousemove', {
                                clientX: target.x,
                                clientY: target.y,
                                bubbles: true,
                                cancelable: true,
                                dispatchedByMe: true
                            });
                            (ctx.canvas || window).dispatchEvent(aimEvent);
                        }
                    }
                }
            });
            return Reflect.apply(...arguments);
        }
    });
})();