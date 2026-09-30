import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { INK, PX } from '../../art/palette';
import { bake, snap } from '../../art/pix';
import { addBackdrop, addMotes } from '../../art/scenery';
import { GROUND, paintLocationBuilding, paintPerson, paintStreet } from '../../art/hubArt';
import { panel, pbutton, piconButton, ptext, ptoast, clip } from '../../art/kit';
import { pxBurst } from '../../art/fx';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    saveHubSessionSnapshot,
} from '../../services/StoryHubSessionPersistence';
import { createWorldMapReturnIntent } from '../worldmap/worldMap';
import {
    assertHubSceneCatalogResourceMatchesLoadedHub,
    normalizeHubSceneLaunchData,
    resolveHubSceneCatalogResource,
    type HubSceneLaunchData,
    type NormalizedHubSceneLaunchData,
    type ResolvedHubSceneCatalogResource,
} from './hubSceneLaunch';
import {
    applyHubNavigationIntent,
    createHubActionIntent,
    createHubLocationSelectionIntent,
    createInitialHubNavigationState,
    createStoryHubSessionKeyFromAction,
    resolveHubLocation,
    shouldActivateHubMarker,
    validateHubTownDefinition,
    type HubNavigationState,
    type HubTownAction,
    type HubTownStartStoryAction,
    type HubTownDefinition,
    type HubTownLocation,
} from './hubTown';
import { QuestJournalOverlay, savedQuestJournalEntries } from '../shared/questJournalOverlay';

interface HubMarker {
    location: HubTownLocation;
    x: number;                                  // street x (logical px, relative to street)
    art: Phaser.GameObjects.Image;
    tag: Phaser.GameObjects.Container;
    keys: { base: string; hot: string };
}

/**
 * A town as a side-view street at dusk: location buildings stand on the road, townsfolk
 * wander past, and the player's disciple walks to whichever place is picked. One compact
 * card at the bottom holds the place's actions.
 */
export class HubScene extends Scene {
    private launchData: NormalizedHubSceneLaunchData = normalizeHubSceneLaunchData();
    private hubResource?: ResolvedHubSceneCatalogResource;
    private town!: HubTownDefinition;
    private navigationState!: HubNavigationState;
    private street?: Phaser.GameObjects.Container;
    private streetWidth = 0;
    private markers: HubMarker[] = [];
    private player?: Phaser.GameObjects.Image;
    private card?: Phaser.GameObjects.Container;
    private questJournal!: QuestJournalOverlay;
    private mapDragState?: { startPointerX: number; startSurfaceX: number; moved: boolean };
    private busy = false;
    private readonly dragDistanceThreshold = 8;

    constructor() {
        super('HubScene');
    }

    init(data?: HubSceneLaunchData): void {
        this.launchData = normalizeHubSceneLaunchData(data);
    }

    preload(): void {
        const hubResource = resolveHubSceneCatalogResource(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.launchData,
        );
        this.hubResource = hubResource;

        this.load.json(this.launchData.hubCacheKey, hubResource.publicPath);
    }

    create(): void {
        this.town = this.readValidatedHubTownDefinition();
        assertHubSceneCatalogResourceMatchesLoadedHub(
            this.town,
            this.launchData,
            this.getResolvedHubResource(),
        );
        const savedSession = loadHubSessionSnapshot(this.launchData.hubId);
        this.navigationState = createInitialHubNavigationState(
            this.town,
            savedSession,
            {
                ...(this.launchData.targetLocationId ? { targetLocationId: this.launchData.targetLocationId } : {}),
                ...(this.launchData.statusText ? { statusText: this.launchData.statusText } : {}),
            },
        );
        if (!this.launchData.targetLocationId && !savedSession?.statusText && this.launchData.statusText) {
            this.navigationState = {
                ...this.navigationState,
                statusText: this.launchData.statusText,
            };
        }
        this.persistHubNavigationState();

        this.questJournal = new QuestJournalOverlay(this);

        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private readValidatedHubTownDefinition(): HubTownDefinition {
        const rawHub = this.cache.json.get(this.launchData.hubCacheKey);
        const hubResource = this.getResolvedHubResource();

        if (rawHub === undefined) {
            throw new Error(
                `HubScene failed to load catalog resource ${hubResource.resourceId} from public/${hubResource.publicPath} for launch hubFile ${this.launchData.hubFile}: JSON cache key ${this.launchData.hubCacheKey} is missing after preload.`,
            );
        }

        try {
            return validateHubTownDefinition(rawHub);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `HubScene failed to validate catalog resource ${hubResource.resourceId} from public/${hubResource.publicPath}: ${message}`,
            );
        }
    }

    private getResolvedHubResource(): ResolvedHubSceneCatalogResource {
        if (!this.hubResource) {
            this.hubResource = resolveHubSceneCatalogResource(
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
                this.launchData,
            );
        }

        return this.hubResource;
    }

    private renderShell(): void {
        this.questJournal.close();
        this.markers = [];
        this.card = undefined;
        this.busy = false;
        const { width, height } = this.scale;
        const sect = this.town.locations.some((l) => ['sect-gate', 'archway'].includes(l.presentation.icon));
        this.cameras.main.setBackgroundColor(INK.ink);
        addBackdrop(this, 'town', sect ? 'dawn' : 'dusk');
        addMotes(this, sect ? 'spirit' : 'ember', -20, 420);

        // The street is at least one screen wide and grows with the number of places.
        const aw = Math.max(Math.ceil(width / PX), this.town.locations.length * 230);
        this.streetWidth = aw * PX;
        const positions = this.town.locations.map((l) => Math.round(Phaser.Math.Clamp(l.presentation.position.x, 0.15, 0.85) * aw));
        const reserved = positions.map((x) => [x - 78, x + 78] as [number, number]);
        const streetKey = bake(this, `pxstreet:${this.launchData.hubId}:${aw}`, () => paintStreet(aw, 17, reserved, sect ? 'sect' : 'town'));
        const artTop = snap(height - 360 * PX);
        const street = this.add.container(0, artTop);
        this.street = street;
        street.add(this.add.image(0, 0, streetKey).setOrigin(0).setScale(PX));

        this.town.locations.forEach((location, i) => this.createHubLocationMarker(location, positions[i] * PX));
        this.spawnTownsfolk(aw);

        const current = resolveHubLocation(this.town, this.navigationState.currentLocationId);
        const marker = this.markers.find((m) => m.location.id === current.id) ?? this.markers[0];
        const p0 = bake(this, 'px:player0', () => paintPerson(0, 0));
        const p1 = bake(this, 'px:player1', () => paintPerson(0, 1));
        this.player = this.add.image(marker.x + PX * 30, GROUND * PX + PX * 2, p0).setOrigin(0.5, 1).setScale(PX).setDepth(5);
        street.add(this.player);
        let f = 0;
        this.time.addEvent({ delay: 420, loop: true, callback: () => { if (!this.busy) return; f ^= 1; this.player?.setTexture(f ? p1 : p0); } });
        this.focusStreet(marker.x, false);

        // HUD: place name + journal + back
        ptext(this, PX * 10, PX * 8, this.town.title, { size: 2, color: INK.paper, fx: 'outline' }).setDepth(50);
        ptext(this, PX * 10, PX * 36, this.town.subtitle, { color: INK.bone, fx: 'outline' }).setDepth(50);
        let x = width - PX * 16;
        piconButton(this, x, PX * 16, 'map', () => this.returnToWorldMap(), 'slate').setDepth(50);
        if (savedQuestJournalEntries().length) {
            x -= PX * 28;
            piconButton(this, x, PX * 16, 'book', () => { this.mapDragState = undefined; this.questJournal.open(); }, 'seal').setDepth(50);
        }

        this.openCard(current, marker);
        this.registerHubMapInputHandlers();
        if (this.navigationState.statusText) this.time.delayedCall(450, () => ptoast(this, this.navigationState.statusText!));
    }

    private createHubLocationMarker(location: HubTownLocation, x: number): HubMarker {
        const icon = location.presentation.icon;
        let top = 0;
        const base = bake(this, `px:hubloc:${icon}`, () => paintLocationBuilding(icon, false));
        top = paintLocationBuilding(icon, false).opaqueTop();
        const hot = bake(this, `px:hubloc:${icon}:hot`, () => paintLocationBuilding(icon, true));
        const art = this.add.image(x, GROUND * PX + PX * 2, base).setOrigin(0.5, 1).setScale(PX).setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
        const label = ptext(this, 0, -PX, location.title, { color: INK.paper, origin: [0.5, 0.5] });
        const tagW = snap(label.width + PX * 12);
        const tag = this.add.container(x, (GROUND - 150 + top) * PX - PX * 12, [panel(this, 0, 0, tagW, PX * 16, 'ink'), label]);
        this.tweens.add({ targets: tag, y: tag.y - PX * 2, duration: 900, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.street!.add([art, tag]);
        const marker: HubMarker = { location, x, art, tag, keys: { base, hot } };
        this.markers.push(marker);

        let down: { x: number; y: number } | undefined;
        art.on('pointerover', () => art.setTexture(hot));
        art.on('pointerout', () => art.setTexture(this.navigationState.currentLocationId === location.id ? hot : base));
        art.on('pointerdown', (p: Phaser.Input.Pointer) => { down = { x: p.x, y: p.y }; });
        art.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (!down || this.busy || this.questJournal.isOpen()) return;
            const ok = shouldActivateHubMarker(down, { x: p.x, y: p.y }, this.dragDistanceThreshold);
            down = undefined;
            if (ok) this.handleHubMarkerSelected(location.id);
        });
        if (this.navigationState.currentLocationId === location.id) art.setTexture(hot);
        return marker;
    }

    private spawnTownsfolk(aw: number): void {
        const count = Math.min(7, 3 + Math.floor(aw / 200));
        for (let i = 0; i < count; i++) {
            const v = 1 + (i % 5);
            const k0 = bake(this, `px:folk${v}:0`, () => paintPerson(v, 0));
            const k1 = bake(this, `px:folk${v}:1`, () => paintPerson(v, 1));
            const depthRow = i % 3;
            const y = GROUND * PX + PX * (4 + depthRow * 10);
            const npc = this.add.image(Math.random() * aw * PX, y, k0).setOrigin(0.5, 1).setScale(PX).setDepth(depthRow);
            this.street!.add(npc);
            let f = 0;
            this.time.addEvent({ delay: 300 + i * 17, loop: true, callback: () => { f ^= 1; npc.setTexture(f ? k1 : k0); } });
            const wander = () => {
                const tx = Phaser.Math.Clamp(npc.x + (Math.random() - 0.5) * 900, PX * 10, aw * PX - PX * 10);
                npc.setFlipX(tx < npc.x);
                this.tweens.add({ targets: npc, x: snap(tx), duration: Math.abs(tx - npc.x) * 9 + 200, ease: 'Linear',
                    onComplete: () => this.time.delayedCall(800 + Math.random() * 2500, wander) });
            };
            this.time.delayedCall(Math.random() * 2000, wander);
        }
        this.street!.sort('depth');
    }

    private focusStreet(x: number, animate = true): void {
        if (!this.street) return;
        const { width } = this.scale;
        const target = snap(Phaser.Math.Clamp(width / 2 - x, width - this.streetWidth, 0));
        if (animate) this.tweens.add({ targets: this.street, x: target, duration: 400, ease: 'Cubic.easeOut' });
        else this.street.x = target;
    }

    private openCard(location: HubTownLocation, marker?: HubMarker): void {
        this.card?.destroy();
        const { width, height } = this.scale;
        const w = snap(Math.min(1500, width - PX * 40));
        const h = PX * 84;
        const c = this.add.container(snap(width / 2), snap(height - h / 2 - PX * 8)).setDepth(60);
        c.add(panel(this, 0, 0, w, h, 'ink'));
        const left = -w / 2 + PX * 12;
        const name = ptext(this, left, -h / 2 + PX * 7, location.title, { size: 2, color: INK.paper });
        const region = ptext(this, left + name.width + PX * 6, -h / 2 + PX * 15, location.presentation.regionLabel, { color: INK.spirit });
        const summaryText = location.summary;
        const summary = ptext(this, left, -h / 2 + PX * 33, clip(summaryText, Math.floor((w - PX * 24) / 36)), { color: INK.haze });
        c.add([name, region, summary]);

        // action buttons in a row; hovering one shows its description in place of the summary
        const gap = PX * 6;
        const labels = location.actions.map((a) => clip(a.label, 10));
        const widths = labels.map((l) => snap([...l].length * 36 + PX * 16));
        let bx = left;
        location.actions.forEach((action, i) => {
            const bw = widths[i];
            const b = pbutton(this, {
                x: bx + bw / 2, y: h / 2 - PX * 17, width: bw, height: PX * 22, label: labels[i],
                style: action.kind === 'startStory' ? 'seal' : 'jade',
                onClick: () => this.handleAction(action),
            });
            b.on('pointerover', () => summary.setText(clip(action.description ?? summaryText, Math.floor((w - PX * 24) / 36))).setColor('#f5cf6a'));
            b.on('pointerout', () => summary.setText(clip(summaryText, Math.floor((w - PX * 24) / 36))).setColor('#b4c3d3'));
            c.add(b);
            bx += bw + gap;
        });
        c.setY(height + h);
        this.tweens.add({ targets: c, y: snap(height - h / 2 - PX * 8), duration: 240, ease: 'Back.easeOut' });
        this.card = c;
        if (marker) this.markers.forEach((m) => m.art.setTexture(m === marker ? m.keys.hot : m.keys.base));
    }

    private handleHubMarkerSelected(locationId: string): void {
        const location = resolveHubLocation(this.town, locationId);
        const marker = this.markers.find((m) => m.location.id === locationId);
        this.navigationState = applyHubNavigationIntent(
            this.town,
            createHubLocationSelectionIntent(
                location.id,
                `已选定前往：${location.title}。`,
            ),
        );
        this.persistHubNavigationState();
        if (!marker || !this.player) { this.renderShell(); return; }
        this.walkTo(marker, () => this.openCard(location, marker));
    }

    private walkTo(marker: HubMarker, done: () => void): void {
        if (!this.player) return done();
        const tx = marker.x + PX * 30;
        this.busy = true;
        this.player.setFlipX(tx < this.player.x);
        this.focusStreet(marker.x);
        pxBurst(this, (this.street?.x ?? 0) + marker.x, marker.tag.y + (this.street?.y ?? 0), { colors: [INK.gold, INK.paper], count: 8, speed: 120, size: 6, depth: 70 });
        this.tweens.add({
            targets: this.player, x: snap(tx), duration: Math.min(1200, Math.abs(tx - this.player.x) * 1.4 + 120), ease: 'Linear',
            onComplete: () => { this.busy = false; done(); },
        });
    }

    private registerHubMapInputHandlers(): void {
        this.input.off('pointerdown', this.handleHubMapPointerDown, this);
        this.input.off('pointermove', this.handleHubMapPointerMove, this);
        this.input.off('pointerup', this.handleHubMapPointerUp, this);
        this.input.on('pointerdown', this.handleHubMapPointerDown, this);
        this.input.on('pointermove', this.handleHubMapPointerMove, this);
        this.input.on('pointerup', this.handleHubMapPointerUp, this);
    }

    private handleHubMapPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.questJournal.isOpen() || !this.street || this.streetWidth <= this.scale.width) return;
        this.mapDragState = { startPointerX: pointer.x, startSurfaceX: this.street.x, moved: false };
    }

    private handleHubMapPointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.mapDragState || !this.street || !pointer.isDown) return;
        const dx = pointer.x - this.mapDragState.startPointerX;
        if (Math.abs(dx) > this.dragDistanceThreshold) this.mapDragState.moved = true;
        this.street.x = snap(Phaser.Math.Clamp(this.mapDragState.startSurfaceX + dx, this.scale.width - this.streetWidth, 0));
    }

    private handleHubMapPointerUp(): void {
        this.mapDragState = undefined;
    }

    private handleAction(action: HubTownAction): void {
        const intent = this.createActionIntent(action);

        if (intent.kind === 'navigateLocation') {
            this.navigationState = applyHubNavigationIntent(this.town, intent);
            this.persistHubNavigationState();
            this.renderShell();
            return;
        }

        this.scene.start(intent.sceneKey, intent.payload);
    }

    private returnToWorldMap(): void {
        this.persistHubNavigationState();

        const intent = createWorldMapReturnIntent({
            source: 'hub',
            statusText: `已从${this.town.title}返回大地图；再次进入城镇会恢复保存位置。`,
        });

        this.scene.start(intent.sceneKey, intent.payload);
    }

    private createActionIntent(action: HubTownAction) {
        if (action.kind !== 'startStory') {
            return createHubActionIntent(action);
        }

        return createHubActionIntent(action, this.loadStorySession(action));
    }

    private loadStorySession(action: HubTownStartStoryAction) {
        return loadStoryRuntimeSession(createStoryHubSessionKeyFromAction(action));
    }

    private persistHubNavigationState(): void {
        saveHubSessionSnapshot({
            hubId: this.launchData.hubId,
            currentLocationId: this.navigationState.currentLocationId,
            ...(this.navigationState.statusText ? { statusText: this.navigationState.statusText } : {}),
            updatedAt: new Date().toISOString(),
        });
    }
}
