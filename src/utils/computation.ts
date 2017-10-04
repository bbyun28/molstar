/**
 * Copyright (c) 2017 molio contributors, licensed under MIT, See LICENSE file for more info.
 *
 * Adapted from https://github.com/dsehnal/LiteMol
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import Scheduler from './scheduler'

interface Computation<A> {
    run(ctx?: Computation.Context): Promise<A>,
    runObservable(ctx?: Computation.Context): Computation.Running<A>
}

namespace Computation {
    export let PRINT_ERRORS_TO_CONSOLE = false;

    export function create<A>(computation: (ctx: Context) => Promise<A>) {
        return new ComputationImpl(computation);
    }

    export function resolve<A>(a: A) {
        return create<A>(_ => Promise.resolve(a));
    }

    export function reject<A>(reason: any) {
        return create<A>(_ => Promise.reject(reason));
    }

    export interface Params {
        updateRateMs: number
    }

    export const Aborted = 'Aborted';

    export interface Progress {
        message: string,
        isIndeterminate: boolean,
        current: number,
        max: number,
        elapsedMs: number,
        requestAbort?: () => void
    }

    export interface ProgressUpdate {
        message?: string,
        abort?: boolean | (() => void),
        current?: number,
        max?: number
    }

    export interface Context {
        readonly isSynchronous: boolean,
        /** Also checks if the computation was aborted. If so, throws. */
        readonly requiresUpdate: boolean,
        requestAbort(): void,
        /** Also checks if the computation was aborted. If so, throws. */
        updateProgress(info: ProgressUpdate): Promise<void> | void
    }

    export type ProgressObserver = (progress: Readonly<Progress>) => void;

    export interface Running<A> {
        subscribe(onProgress: ProgressObserver): void,
        result: Promise<A>
    }

    /** A context without updates. */
    export const synchronous: Context = {
        isSynchronous: true,
        requiresUpdate: false,
        requestAbort() { },
        updateProgress(info) { }
    }

    export function observable(params?: Partial<Params>) {
        return new ObservableContext(params);
    }

    declare var process: any;
    declare var window: any;

    export const now: () => number = (function () {
        if (typeof window !== 'undefined' && window.performance) {
            const perf = window.performance;
            return () => perf.now();
        } else if (typeof process !== 'undefined' && process.hrtime !== 'undefined') {
            return () => {
                let t = process.hrtime();
                return t[0] * 1000 + t[1] / 1000000;
            };
        } else {
            return () => +new Date();
        }
    }());

    /** A utility for splitting large computations into smaller parts. */
    export interface Chunker {
        setNextChunkSize(size: number): void,
        /** nextChunk must return the number of actually processed chunks. */
        process(nextChunk: (chunkSize: number) => number, update: (updater: Context['updateProgress']) => void, nextChunkSize?: number): Promise<void>
    }

    export function chunker(ctx: Context, nextChunkSize: number): Chunker {
        return new ChunkerImpl(ctx, nextChunkSize);
    }
}

const DefaulUpdateRateMs = 150;
const NoOpSubscribe = () => { }

class ComputationImpl<A> implements Computation<A> {
    run(ctx?: Computation.Context) {
        return this.runObservable(ctx).result;
    }

    runObservable(ctx?: Computation.Context): Computation.Running<A> {
        const context = ctx ? ctx as ObservableContext : new ObservableContext();

        return {
            subscribe: (context as ObservableContext).subscribe || NoOpSubscribe,
            result: new Promise<A>(async (resolve, reject) => {
                try {
                    if (context.started) context.started();
                    const result = await this.computation(context);
                    resolve(result);
                } catch (e) {
                    if (Computation.PRINT_ERRORS_TO_CONSOLE) console.error(e);
                    reject(e);
                } finally {
                    if (context.finished) context.finished();
                }
            })
        };
    }

    constructor(private computation: (ctx: Computation.Context) => Promise<A>) {

    }
}

class ObservableContext implements Computation.Context {
    readonly updateRate: number;
    readonly isSynchronous: boolean = false;
    private level = 0;
    private startedTime = 0;
    private abortRequested = false;
    private lastUpdated = 0;
    private observers: Computation.ProgressObserver[] | undefined = void 0;
    private progress: Computation.Progress = { message: 'Working...', current: 0, max: 0, elapsedMs: 0, isIndeterminate: true, requestAbort: void 0 };

    lastDelta = 0;

    private checkAborted() {
        if (this.abortRequested) throw Computation.Aborted;
    }

    private abortRequester = () => { this.abortRequested = true };

    subscribe = (obs: Computation.ProgressObserver) => {
        if (!this.observers) this.observers = [];
        this.observers.push(obs);
    }

    requestAbort() {
        try {
            if (this.abortRequester) {
                this.abortRequester.call(null);
            }
        } catch (e) { }
    }

    updateProgress({ message, abort, current, max }: Computation.ProgressUpdate): Promise<void> | void {
        this.checkAborted();

        const time = Computation.now();

        if (typeof abort === 'boolean') {
            this.progress.requestAbort = abort ? this.abortRequester : void 0;
        } else {
            if (abort) this.abortRequester = abort;
            this.progress.requestAbort = abort ? this.abortRequester : void 0;
        }

        if (typeof message !== 'undefined') this.progress.message = message;
        this.progress.elapsedMs = time - this.startedTime;
        if (isNaN(current!)) {
            this.progress.isIndeterminate = true;
        } else {
            this.progress.isIndeterminate = false;
            this.progress.current = current!;
            if (!isNaN(max!)) this.progress.max = max!;
        }

        if (this.observers) {
            const p = { ...this.progress };
            for (const o of this.observers) Scheduler.immediate(o, p);
        }

        this.lastDelta = time - this.lastUpdated;
        this.lastUpdated = time;

        return Scheduler.immediatePromise();
    }

    get requiresUpdate() {
        this.checkAborted();
        if (this.isSynchronous) return false;
        return Computation.now() - this.lastUpdated > this.updateRate;
    }

    started() {
        if (!this.level) this.startedTime = Computation.now();
        this.level++;
    }

    finished() {
        this.level--;
        if (this.level < 0) {
            throw new Error('Bug in code somewhere, Computation.resolve/reject called too many times.');
        }
        if (!this.level) this.observers = void 0;
    }

    constructor(params?: Partial<Computation.Params>) {
        this.updateRate = (params && params.updateRateMs) || DefaulUpdateRateMs;
    }
}

class ChunkerImpl implements Computation.Chunker {
    private processedSinceUpdate = 0;
    private updater: Computation.Context['updateProgress'];

    private computeChunkSize() {
        const lastDelta = (this.context as ObservableContext).lastDelta || 0;
        if (!lastDelta) return this.nextChunkSize;
        const rate = (this.context as ObservableContext).updateRate || DefaulUpdateRateMs;
        const ret = Math.round(this.processedSinceUpdate * rate / lastDelta + 1);
        this.processedSinceUpdate = 0;
        return ret;
    }

    private getNextChunkSize() {
        const ctx = this.context as ObservableContext;
        // be smart if the computation is synchronous and process the whole chunk at once.
        if (ctx.isSynchronous) return Number.MAX_SAFE_INTEGER;
        return this.nextChunkSize;
    }

    setNextChunkSize(size: number) {
        this.nextChunkSize = size;
    }

    async process(nextChunk: (size: number) => number, update: (updater: Computation.Context['updateProgress']) => Promise<void> | void, nextChunkSize?: number) {
        if (typeof nextChunkSize !== 'undefined') this.setNextChunkSize(nextChunkSize);

        let lastChunkSize: number;
        while ((lastChunkSize = nextChunk(this.getNextChunkSize())) > 0) {
            this.processedSinceUpdate += lastChunkSize;
            if (this.context.requiresUpdate) {
                await update(this.updater);
                this.nextChunkSize = this.computeChunkSize();
            }
        }
        if (this.context.requiresUpdate) {
            await update(this.updater);
            this.nextChunkSize = this.computeChunkSize();
        }
    }

    constructor(public context: Computation.Context, private nextChunkSize: number) {
        this.updater = this.context.updateProgress.bind(this.context);
    }
}

export default Computation;