import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { INK, PX } from '../../art/palette';
import { Pix, bake, snap } from '../../art/pix';
import { panel, pbutton, piconButton, ptext, ptoast, clip, type PButton } from '../../art/kit';
import { paintLandmark } from '../../art/buildings';
import { paintCloudFringe, paintWorldMap, roadPoint, spanningRoads, travellerPix, type MapSite } from '../../art/worldArt';
import { pxBurst } from '../../art/fx';
import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
    QINGYUN_WORLD_MAP_RESOURCE_ID,
    createContentCatalogResolver,
} from '../../content/contentCatalog';
import {
    clampWorldMapSurfacePosition,
    createWorldMapInitialSurfacePosition,
    createWorldMapDestinationIntent,
    createWorldMapDestinationSelectionStatusText,
    shouldActivateWorldMapMarker,
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapDestination,
    type WorldMapPresentation,
    type WorldMapReturnPayload,
    type WorldMapViewport,
} from './worldMap';
import { QuestJournalOverlay, savedQuestJournalEntries } from '../shared/questJournalOverlay';

export const WORLD_MAP_CACHE_KEY = 'worldMapShell';
const LAST_DESTINATION_KEY = 'qingyun:worldmap:last-destination';

interface Marker {
    destination: WorldMapDestination;
    site: MapSite;              // art px on the map
    container: Phaser.GameObjects.Container;
    art: Phaser.GameObjects.Image;
    tag: Phaser.GameObjects.Container;
}

/**
 * The region map fills the whole screen: a hand-painted pixel island you can drag around,
 * landmarks you can hover and pick, and a little traveller who walks the roads between them.
 */
export class WorldMapScene extends Scene {
    private worldMap!: WorldMapDefinition;
    private worldMapPublicPath?: string;
    private questJournal!: QuestJournalOverlay;
    private surface?: Phaser.GameObjects.Container;
    private surfacePresentation!: WorldMapPresentation;
    private mapViewport!: WorldMapViewport;
    private markers: Marker[] = [];
    private roads: Array<[number, number]> = [];
    private traveller?: Phaser.GameObjects.Image;
    private travellerAt = 0;
    private selected = -1;
    private card?: Phaser.GameObjects.Container;
    private travelling = false;
    private mapDragState?: { startPointerX: number; startPointerY: number; startSurfaceX: number; startSurfaceY: number; moved: boolean };
    private returnStatusText?: string;
    private readonly dragDistanceThreshold = 8;

    constructor() {
        super('WorldMapScene');
    }

    init(data?: WorldMapReturnPayload): void {
        this.returnStatusText = data?.statusText;
    }

    preload(): void {
        const catalogResolver = createContentCatalogResolver(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            {
                context: 'WorldMapScene',
                sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
            },
        );
        const worldMapResource = catalogResolver.resolveJsonResource({
            resourceId: QINGYUN_WORLD_MAP_RESOURCE_ID,
            expectedKind: 'worldMap',
        });
        this.worldMapPublicPath = worldMapResource.publicPath;

        this.load.json(WORLD_MAP_CACHE_KEY, worldMapResource.publicPath);
    }

    create(): void {
        this.worldMap = this.readValidatedWorldMapResource();
        this.questJournal = new QuestJournalOverlay(this);
        this.markers = [];
        this.selected = -1;
        this.card = undefined;
        this.travelling = false;
        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private readValidatedWorldMapResource(): WorldMapDefinition {
        const rawWorldMap = this.cache.json.get(WORLD_MAP_CACHE_KEY);
        const publicPath = this.worldMapPublicPath ?? 'unresolved public path';

        if (rawWorldMap === undefined) {
            throw new Error(
                `WorldMapScene failed to load catalog resource ${QINGYUN_WORLD_MAP_RESOURCE_ID} from public/${publicPath}: JSON cache key ${WORLD_MAP_CACHE_KEY} is missing after preload.`,
            );
        }

        try {
            return validateWorldMapDefinition(rawWorldMap);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `WorldMapScene failed to validate catalog resource ${QINGYUN_WORLD_MAP_RESOURCE_ID} from public/${publicPath}: ${message}`,
            );
        }
    }

    private renderShell(): void {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(INK.indigo);

        // Map art is larger than the screen so it can be explored by dragging.
        const aw = Math.max(Math.ceil(width / PX * 1.18), 760);
        const ah = 440;
        const sites: MapSite[] = this.worldMap.destinations.map((d) => ({
            x: Math.round(d.presentation.position.x * aw),
            y: Math.round(d.presentation.position.y * ah),
        }));
        this.roads = spanningRoads(sites);
        const mapKey = bake(this, `pxmap:${this.worldMap.id}:${aw}x${ah}`, () => paintWorldMap(aw, ah, sites, this.roads, 11));
        const fringeKey = bake(this, `pxmapfringe:${aw}x${ah}`, () => paintCloudFringe(aw, ah, 5));

        this.surfacePresentation = {
            mapWidth: aw * PX,
            mapHeight: ah * PX,
            initialCenter: this.worldMap.presentation.initialCenter,
        };
        this.mapViewport = { left: 0, top: 0, width, height };
        const start = createWorldMapInitialSurfacePosition(this.surfacePresentation, this.mapViewport);
        const surface = this.add.container(start.x, start.y);
        this.surface = surface;
        surface.add(this.add.image(0, 0, mapKey).setOrigin(0).setScale(PX));
        this.worldMap.destinations.forEach((destination, i) => this.createDestinationMarker(destination, sites[i], i));
        surface.add(this.add.image(0, 0, fringeKey).setOrigin(0).setScale(PX));

        // traveller
        const lastId = this.readLastDestination();
        const startIndex = Math.max(0, this.worldMap.destinations.findIndex((d) => d.id === (lastId ?? this.worldMap.defaultDestinationId)));
        this.travellerAt = startIndex;
        const t0 = bake(this, 'px:traveller0', () => travellerPix(0));
        const t1 = bake(this, 'px:traveller1', () => travellerPix(1));
        const tp = this.siteToSurface(sites[startIndex]);
        this.traveller = this.add.image(tp.x + PX * 24, tp.y + PX * 4, t0).setOrigin(0.5, 1).setScale(PX);
        surface.add(this.traveller);
        let f = 0;
        this.time.addEvent({ delay: 380, loop: true, callback: () => { f ^= 1; this.traveller?.setTexture(f ? t1 : t0); } });
        this.addCloudShadows(surface, aw, ah);
        this.centerOn(tp.x, tp.y, false);

        this.renderHud();
        this.registerMapInputHandlers();

        const kb = this.input.keyboard;
        kb?.on('keydown-RIGHT', () => this.selectMarker((Math.max(0, this.selected) + 1) % this.markers.length));
        kb?.on('keydown-LEFT', () => this.selectMarker((Math.max(0, this.selected) - 1 + this.markers.length) % this.markers.length));
        kb?.on('keydown-ENTER', () => { if (this.selected >= 0) this.handleDestinationSelected(this.markers[this.selected].destination.id); });
        kb?.on('keydown-ESC', () => this.closeCard());

        if (this.returnStatusText) this.time.delayedCall(450, () => ptoast(this, this.returnStatusText!));
    }

    private renderHud(): void {
        const { width } = this.scale;
        ptext(this, PX * 10, PX * 8, this.worldMap.title, { size: 2, color: INK.paper, fx: 'outline' }).setDepth(50).setScrollFactor(0);
        let x = width - PX * 16;
        piconButton(this, x, PX * 16, 'back', () => this.scene.start('MainMenu')).setDepth(50);
        if (savedQuestJournalEntries().length) {
            x -= PX * 28;
            piconButton(this, x, PX * 16, 'book', () => { this.mapDragState = undefined; this.questJournal.open(); }, 'seal').setDepth(50);
        }
    }

    private addCloudShadows(surface: Phaser.GameObjects.Container, aw: number, ah: number): void {
        for (let i = 0; i < 4; i++) {
            const key = bake(this, `px:mapcloud:${i}`, () => {
                const p = new Pix(70, 20);
                const r = Math.random;
                for (let k = 0; k < 6; k++) p.ellipse(12 + Math.floor(r() * 46), 12 - Math.floor(r() * 5), 6 + Math.floor(r() * 5), 3 + Math.floor(r() * 3), INK.paper);
                p.rect(0, 15, 70, 5, -1);
                p.rect(8, 14, 54, 1, INK.haze);
                return p.outline(INK.mist);
            });
            const c = this.add.image(snap(Math.random() * aw * PX), snap((0.1 + Math.random() * 0.7) * ah * PX), key).setScale(PX).setAlpha(1);
            surface.add(c);
            this.tweens.add({ targets: c, x: c.x + aw * PX * 0.4, duration: 120000 + Math.random() * 60000, repeat: -1, yoyo: true });
        }
    }

    private siteToSurface(site: MapSite): { x: number; y: number } {
        return { x: site.x * PX, y: site.y * PX };
    }

    private centerOn(x: number, y: number, animate = true): void {
        if (!this.surface) return;
        const { width, height } = this.scale;
        const target = clampWorldMapSurfacePosition(this.surfacePresentation, this.mapViewport, { x: width / 2 - x, y: height / 2 - y });
        if (animate) this.tweens.add({ targets: this.surface, x: snap(target.x), y: snap(target.y), duration: 350, ease: 'Cubic.easeOut' });
        else this.surface.setPosition(snap(target.x), snap(target.y));
    }

    private createDestinationMarker(destination: WorldMapDestination, site: MapSite, index: number): Marker {
        const pos = this.siteToSurface(site);
        const container = this.add.container(pos.x, pos.y);
        const shadow = this.add.ellipse(0, 0, PX * 44, PX * 10, INK.void, 0.3);
        const art = this.add.image(0, PX, bake(this, `px:lm2:${destination.presentation.icon}`, () => paintLandmark(destination.presentation.icon)))
            .setOrigin(0.5, 1).setScale(PX);
        const hub = destination.kind === 'hub';
        const label = ptext(this, 0, 0, destination.label, { color: INK.paper, origin: [0.5, 0.5], fx: 'shadow' });
        const tagW = snap(label.width + PX * 10), tagH = PX * 16;
        const tagBg = panel(this, 0, 0, tagW, tagH, hub ? 'ink' : 'gold');
        const pip = this.add.rectangle(-tagW / 2 + PX * 4, 0, PX * 2, PX * 2, hub ? INK.spirit : INK.vermilion);
        const tag = this.add.container(0, PX * 12, [tagBg, label, pip]);
        label.setY(-PX);
        const hit = this.add.rectangle(0, -PX * 12, PX * 54, PX * 56, 0, 0.001).setInteractive({ useHandCursor: true });
        container.add([shadow, art, tag, hit]);
        this.surface!.add(container);

        this.tweens.add({ targets: art, y: art.y - PX, duration: 900 + index * 70, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
        const marker: Marker = { destination, site, container, art, tag };
        this.markers.push(marker);

        let down: { x: number; y: number } | undefined;
        hit.on('pointerover', () => { if (!this.travelling) this.hoverMarker(marker, true); });
        hit.on('pointerout', () => this.hoverMarker(marker, false));
        hit.on('pointerdown', (p: Phaser.Input.Pointer) => { down = { x: p.x, y: p.y }; });
        hit.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (!down || this.travelling || this.questJournal.isOpen()) return;
            const click = shouldActivateWorldMapMarker(down, { x: p.x, y: p.y }, this.dragDistanceThreshold);
            down = undefined;
            if (!click) return;
            if (this.selected === index) this.handleDestinationSelected(destination.id);
            else this.selectMarker(index);
        });
        return marker;
    }

    private hoverMarker(m: Marker, on: boolean): void {
        m.tag.setScale(on ? 1.0 : 1);
        m.tag.y = on ? PX * 11 : PX * 12;
        m.art.setTint(on ? 0xffffff : 0xffffff);
        if (on) this.tweens.add({ targets: m.art, scaleX: PX * 1.1, scaleY: PX * 0.9, duration: 80, yoyo: true, ease: 'Stepped', easeParams: [2] });
    }

    private selectMarker(index: number): void {
        if (this.travelling || !this.markers[index]) return;
        this.selected = index;
        const m = this.markers[index];
        this.markers.forEach((mk, i) => mk.container.setDepth(i === index ? 2 : 1));
        const p = this.siteToSurface(m.site);
        this.centerOn(p.x, p.y + PX * 20);
        pxBurst(this, (this.surface?.x ?? 0) + p.x, (this.surface?.y ?? 0) + p.y - PX * 10, { colors: [INK.gold, INK.paper], count: 8, speed: 120, size: 6, depth: 60 });
        this.openCard(m.destination);
    }

    private openCard(destination: WorldMapDestination): void {
        this.card?.destroy();
        const { width, height } = this.scale;
        const w = snap(Math.min(1200, width - PX * 40));
        const h = PX * 72;
        const c = this.add.container(snap(width / 2), height + h).setDepth(80);
        const hub = destination.kind === 'hub';
        const bg = panel(this, 0, 0, w, h, 'ink');
        const iconFrame = panel(this, -w / 2 + PX * 34, 0, PX * 60, PX * 52, 'slate');
        const icon = this.add.image(-w / 2 + PX * 34, PX * 21, bake(this, `px:lm2:${destination.presentation.icon}`, () => paintLandmark(destination.presentation.icon)))
            .setOrigin(0.5, 1).setScale(PX);
        const left = -w / 2 + PX * 72;
        const name = ptext(this, left, -h / 2 + PX * 8, destination.label, { size: 2, color: INK.paper });
        const kind = ptext(this, left + name.width + PX * 6, -h / 2 + PX * 16, `${hub ? '驻地' : '秘境'} · ${destination.presentation.regionLabel}`, { color: hub ? INK.spirit : INK.amber });
        const btnW = PX * 64;
        const desc = ptext(this, left, -h / 2 + PX * 33, clip(destination.description, Math.floor((w - PX * 60 - btnW - PX * 20) / 36) * 2), {
            color: INK.haze, wrap: w - PX * 72 - btnW - PX * 20,
        });
        const go: PButton = pbutton(this, { x: w / 2 - btnW / 2 - PX * 10, y: PX * 12, width: btnW, height: PX * 24, label: hub ? '前 往' : '出 发', style: 'seal', size: 1,
            onClick: () => this.handleDestinationSelected(destination.id) });
        const close = piconButton(this, w / 2 - PX * 12, -h / 2 + PX * 13, 'close', () => this.closeCard(), 'slate', 14);
        c.add([bg, iconFrame, icon, name, kind, desc, go, close]);
        this.tweens.add({ targets: c, y: snap(height - h / 2 - PX * 8), duration: 240, ease: 'Back.easeOut' });
        this.card = c;
    }

    private closeCard(): void {
        if (!this.card) return;
        const c = this.card;
        this.card = undefined;
        this.selected = -1;
        this.tweens.add({ targets: c, y: this.scale.height + 300, duration: 180, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
    }

    private registerMapInputHandlers(): void {
        this.input.off('pointerdown', this.handleMapPointerDown, this);
        this.input.off('pointermove', this.handleMapPointerMove, this);
        this.input.off('pointerup', this.handleMapPointerUp, this);
        this.input.on('pointerdown', this.handleMapPointerDown, this);
        this.input.on('pointermove', this.handleMapPointerMove, this);
        this.input.on('pointerup', this.handleMapPointerUp, this);
    }

    private handleMapPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
        if (this.questJournal.isOpen() || !this.surface || this.travelling) return;
        if (this.card && over.some((o) => this.card!.exists(o) || o.parentContainer === this.card)) return;
        this.mapDragState = {
            startPointerX: pointer.x,
            startPointerY: pointer.y,
            startSurfaceX: this.surface.x,
            startSurfaceY: this.surface.y,
            moved: false,
        };
    }

    private handleMapPointerMove(pointer: Phaser.Input.Pointer): void {
        if (this.questJournal.isOpen() || !this.mapDragState || !this.surface || !pointer.isDown) return;
        const deltaX = pointer.x - this.mapDragState.startPointerX;
        const deltaY = pointer.y - this.mapDragState.startPointerY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > this.dragDistanceThreshold) this.mapDragState.moved = true;
        const clampedPosition = clampWorldMapSurfacePosition(this.surfacePresentation, this.mapViewport, {
            x: this.mapDragState.startSurfaceX + deltaX,
            y: this.mapDragState.startSurfaceY + deltaY,
        });
        this.surface.setPosition(snap(clampedPosition.x), snap(clampedPosition.y));
    }

    private handleMapPointerUp(_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
        const drag = this.mapDragState;
        this.mapDragState = undefined;
        // a plain click on empty map dismisses the card
        if (drag && !drag.moved && over.length === 0) this.closeCard();
    }

    /** BFS over the road tree from the traveller to `target`, returning site indices. */
    private routeTo(target: number): number[] {
        const prev = new Map<number, number>([[this.travellerAt, -1]]);
        const queue = [this.travellerAt];
        while (queue.length) {
            const a = queue.shift()!;
            if (a === target) break;
            for (const [x, y] of this.roads) {
                const b = x === a ? y : y === a ? x : -1;
                if (b >= 0 && !prev.has(b)) { prev.set(b, a); queue.push(b); }
            }
        }
        const path: number[] = [];
        for (let at = target; at !== -1 && at !== undefined; at = prev.get(at)!) path.unshift(at);
        return path[0] === this.travellerAt ? path : [this.travellerAt, target];
    }

    private handleDestinationSelected(destinationId: string): void {
        if (this.travelling) return;
        const intent = createWorldMapDestinationIntent(this.worldMap, destinationId);
        const index = this.worldMap.destinations.findIndex((candidate) => candidate.id === destinationId);
        const destination = this.worldMap.destinations[index];
        this.travelling = true;
        this.writeLastDestination(destinationId);
        this.closeCard();

        const { width, height } = this.scale;
        const caption = ptext(this, width / 2, height - PX * 20, createWorldMapDestinationSelectionStatusText(destination), {
            color: INK.bone, fx: 'outline', origin: [0.5, 0.5],
        }).setDepth(90);
        this.tweens.add({ targets: caption, alpha: 0.4, duration: 300, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });

        const path = this.routeTo(index);
        const segments: Array<[MapSite, MapSite]> = [];
        for (let i = 0; i + 1 < path.length; i++) segments.push([this.markers[path[i]].site, this.markers[path[i + 1]].site]);
        const walk = (k: number) => {
            if (k >= segments.length || !this.traveller) {
                this.scene.start(intent.sceneKey, intent.payload);
                return;
            }
            const [A, B] = segments[k];
            const roadDir = this.roads.some(([a, b]) => this.markers[a].site === A && this.markers[b].site === B);
            const st = { t: 0 };
            this.tweens.add({
                targets: st, t: 1, duration: 520, ease: 'Linear',
                onUpdate: () => {
                    const p = roadDir ? roadPoint(A, B, st.t) : roadPoint(B, A, 1 - st.t);
                    this.traveller!.setPosition(snap(p.x * PX), snap(p.y * PX + PX * 2));
                    this.traveller!.setFlipX(B.x < A.x);
                    this.centerOn(p.x * PX, p.y * PX, false);
                },
                onComplete: () => walk(k + 1),
            });
        };
        if (!segments.length) this.time.delayedCall(250, () => this.scene.start(intent.sceneKey, intent.payload));
        else walk(0);
    }

    private readLastDestination(): string | undefined {
        try { return window.localStorage.getItem(LAST_DESTINATION_KEY) ?? undefined; } catch { return undefined; }
    }

    private writeLastDestination(id: string): void {
        try { window.localStorage.setItem(LAST_DESTINATION_KEY, id); } catch { /* storage unavailable */ }
    }
}
