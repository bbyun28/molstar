/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginContext } from '../context';
import { ImagePass } from '../../mol-canvas3d/passes/image';
import { StateSelection } from '../../mol-state';
import { PluginStateObject } from '../state/objects';
import { Task, RuntimeContext } from '../../mol-task';
import { canvasToBlob } from '../../mol-canvas3d/util';
import { download } from '../../mol-util/download';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { SyncRuntimeContext } from '../../mol-task/execution/synchronous';

export { ViewportScreenshotHelper }

namespace ViewportScreenshotHelper {
    export type ResolutionSettings = PD.Values<ReturnType<ViewportScreenshotHelper['createParams']>>['resolution']
    export type ResolutionTypes = ResolutionSettings['name']
}

class ViewportScreenshotHelper {
    private createParams() {
        const max = Math.min(this.plugin.canvas3d ? this.plugin.canvas3d.webgl.maxRenderbufferSize : 4096, 4096)
        return {
            transparent: PD.Boolean(false),
            resolution: PD.MappedStatic('full-hd', {
                viewport: PD.Group({}),
                hd: PD.Group({}),
                'full-hd': PD.Group({}),
                'ultra-hd': PD.Group({}),
                custom: PD.Group({
                    width: PD.Numeric(1920, { min: 128, max, step: 1 }),
                    height: PD.Numeric(1080, { min: 128, max, step: 1 }),
                }, { isFlat: true })
            }, {
                options: [
                    ['viewport', 'Viewport'],
                    ['hd', 'HD (1280 x 720)'],
                    ['full-hd', 'Full HD (1920 x 1080)'],
                    ['ultra-hd', 'Ultra HD (3840 x 2160)'],
                    ['custom', 'Custom']
                ]
            })
        }
    }
    private _params: ReturnType<ViewportScreenshotHelper['createParams']> = void 0 as any;
    get params() {
        if (this._params) return this._params;
        return this._params = this.createParams();
    }

    get values() {
        return this.currentResolution.type === 'custom'
            ? { transparent: this.transparent, resolution: { name: 'custom', params: { width: this.currentResolution.width, height: this.currentResolution.height } } }
            : { transparent: this.transparent, resolution: { name: this.currentResolution.type, params: { } } };
    }

    private getCanvasSize() {
        return {
            width: this.plugin.canvas3d?.webgl.gl.drawingBufferWidth || 0,
            height: this.plugin.canvas3d?.webgl.gl.drawingBufferHeight || 0
        };
    }

    transparent = false

    currentResolution = {
        type: 'full-hd' as ViewportScreenshotHelper.ResolutionTypes,
        width: 1920,
        height: 1080
    };

    private getSize() {
        switch (this.currentResolution.type ) {
            case 'viewport': return this.getCanvasSize();
            case 'hd': return { width: 1280, height: 720 };
            case 'full-hd': return { width: 1920, height: 1080 };
            case 'ultra-hd': return { width: 3840, height: 2160 };
            default: return { width: this.currentResolution.width, height: this.currentResolution.height }
        }
    }

    private _imagePass: ImagePass;

    get imagePass() {
        if (this._imagePass) return this._imagePass;

        this._imagePass = this.plugin.canvas3d!.getImagePass()
        this._imagePass.setProps({
            transparentBackground: this.transparent,
            multiSample: { mode: 'on', sampleLevel: 2 },
            postprocessing: this.plugin.canvas3d!.props.postprocessing
        });
        return this._imagePass;
    }

    getFilename() {
        const models = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PluginStateObject.Molecule.Model)).map(s => s.obj!.data)
        const uniqueIds = new Set<string>()
        models.forEach(m => uniqueIds.add(m.entryId.toUpperCase()))
        const idString = Array.from(uniqueIds).join('-')
        return `${idString || 'molstar-image'}.png`
    }

    private canvas = function () {
        const canvas = document.createElement('canvas');
        return canvas;
    }();

    // private preview = () => {
    //     const { width, height } = this.getSize()
    //     if (width <= 0 || height <= 0) return

    //     let w: number, h: number
    //     const aH = maxHeightUi / height
    //     const aW = maxWidthUi / width
    //     if (aH < aW) {
    //         h = Math.round(Math.min(maxHeightUi, height))
    //         w = Math.round(width * (h / height))
    //     } else {
    //         w = Math.round(Math.min(maxWidthUi, width))
    //         h = Math.round(height * (w / width))
    //     }
    //     setCanvasSize(this.canvas, w, h)
    //     const pixelRatio = this.plugin.canvas3d?.webgl.pixelRatio || 1
    //     const pw = Math.round(w * pixelRatio)
    //     const ph = Math.round(h * pixelRatio)
    //     const imageData = this.imagePass.getImageData(pw, ph)
    //     this.canvasContext.putImageData(imageData, 0, 0)
    // }

    private async draw(ctx: RuntimeContext) {
        const { width, height } = this.getSize();
        if (width <= 0 || height <= 0) return;

        await ctx.update('Rendering image...')
        this.imagePass.setProps({
            transparentBackground: this.transparent,
            postprocessing: this.plugin.canvas3d!.props.postprocessing // TODO this line should not be required, updating should work by listening to this.plugin.events.canvas3d.settingsUpdated
        });
        const imageData = this.imagePass.getImageData(width, height);

        await ctx.update('Encoding image...')
        const canvas = this.canvas
        canvas.width = imageData.width
        canvas.height = imageData.height
        const canvasCtx = canvas.getContext('2d')
        if (!canvasCtx) throw new Error('Could not create canvas 2d context')
        canvasCtx.putImageData(imageData, 0, 0)
        return;
    }

    private downloadTask() {
        return Task.create('Download Image', async ctx => {
            this.draw(ctx);
            await ctx.update('Downloading image...')
            const blob = await canvasToBlob(this.canvas, 'png')
            download(blob, this.getFilename())
        })
    }

    downloadCurrent() {
        return this.plugin.runTask(Task.create('Download Image', async ctx => {
            await ctx.update('Downloading image...')
            const blob = await canvasToBlob(this.canvas, 'png')
            download(blob, this.getFilename())
        }));
    }

    async imageData() {
        await this.draw(SyncRuntimeContext)
        return this.canvas.toDataURL();
    }

    download() {
        this.plugin.runTask(this.downloadTask());
    }

    constructor(private plugin: PluginContext) {

    }
}