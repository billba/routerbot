import { Promiseable, isPromised } from 'botbuilder';

const toPromise = <T> (t: Promiseable<T>) => isPromised(t) ? t : Promise.resolve(t);

declare global {
    interface ConversationState {
        topical: {
            instances: {
                [instanceName: string]: TopicInstance;
            }
            rootInstanceName: string;
        },
    }
}

class TopicInstance <State = any> {
    public name: string;
    public state = {} as State;

    constructor(
        public topicName: string,
        public callbackInstanceName?: string,
    ) {
    }
}

type TopicInit <
    State,
    InitArgs,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicInitHelper<State, InitArgs, CallbackArgs>,
) => T;

enum TopicLifecycle {
    next,
    complete,
    dispatch,
}

class TopicInitHelper <
    State,
    InitArgs,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        public args: InitArgs,
        private data: TopicHelperData <CallbackArgs>
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicLifecycle.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicLifecycle.complete;
        this.data.args = args;
    }

    dispatch () {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicLifecycle.dispatch;
    }
}

type TopicNext <
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicNextHelper<State, CallbackArgs>
) => T

class TopicNextHelper <
    State,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CallbackArgs>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.complete;
        this.data.args = args;
    }
}

interface TopicHelperData <CallbackArgs> {
    lifecycle?: TopicLifecycle;
    args?: CallbackArgs;
}

type TopicOnReceive <
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicOnReceiveHelper<State, CallbackArgs>
) => T;

class TopicOnReceiveHelper <
    State,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CallbackArgs>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.complete;
        this.data.args = args;
    }
}

type TopicCallback <
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topicCallbackHelper: TopicCallbackHelper<State, CallbackArgs>,
) => T;

class TopicCallbackHelper <
    State,
    CallbackArgs,
> {
    constructor(
        public instance: TopicInstance<State>,
        public args: CallbackArgs,
        public child: string,
        private data: TopicHelperData<CallbackArgs>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicLifecycle.complete;
        this.data.args = args;
    }
}

const returnsPromiseVoid = () => Promise.resolve();

export class Topic <
    State extends {} = {},
    InitArgs extends {} = {},
    CallbackArgs extends {} = {},
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected _init: TopicInit<State, InitArgs, CallbackArgs, Promise<void>> = returnsPromiseVoid;
    protected _next: TopicNext<State, CallbackArgs, Promise<void>> = returnsPromiseVoid;
    protected _onReceive: TopicOnReceive<State, CallbackArgs, Promise<void>> = returnsPromiseVoid;

    constructor (
        public name: string,
        behavior?: 'singleton' | 'overwrite',
    ) {
        if (Topic.topics[name]) {
            switch (behavior) {
                case 'singleton':
                    return;
                case 'overwrite':
                    break;
                default:
                    throw new Error(`An attempt was made to create a topic with existing name "${name}". Ignored.`);
            }
        }
        
        Topic.topics[name] = this;
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
        callbackInstanceName?: string,
    ): Promise<string>;

    createInstance (
        context: BotContext,
        callbackInstanceName?: string,
    ): Promise<string>;
    
    async createInstance (
        context: BotContext,
        ... params,
    ) {
        let args: InitArgs = params.length > 0 && typeof params[0] !== 'string'
            ? params[0]
            : {}
        
        let callbackInstanceName: string = params.length > 0 && typeof params[0] === 'string'
            ? params[0]
            : params.length > 1 && typeof params[1] === 'string'
                ? params[1]
                : undefined;
     
        const data = {} as TopicHelperData<CallbackArgs>;
        const instance = new TopicInstance<State>(this.name, callbackInstanceName);

        await toPromise(this._init(context, new TopicInitHelper(context, instance, args, data)));

        if (data.lifecycle === TopicLifecycle.complete) {
            await Topic.complete(context, instance, data.args);

            return undefined;
        } else {
            instance.name = Date.now().toString() + Math.random().toString().substr(1);
            context.state.conversation.topical.instances[instance.name] = instance;
    
            if (data.lifecycle === TopicLifecycle.next) {
                await Topic.next(context, instance.name);
            } else if (data.lifecycle === TopicLifecycle.dispatch) {
                await Topic.dispatch(context, instance.name);
            }

            return instance.name;
        }
    }

    static async do (
        context: BotContext,
        getRootInstanceName: () => Promise<string>
    ) {
        if (context.state.conversation.topical)
            return Topic.dispatch(context, context.state.conversation.topical.rootInstanceName);
        
        context.state.conversation.topical = {
            instances: {},
            rootInstanceName: undefined
        }

        context.state.conversation.topical.rootInstanceName = await getRootInstanceName();
    }

    static async next (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any>;

        await topic._next(context, new TopicNextHelper(context, instance, data));

        if (data.lifecycle === TopicLifecycle.next) {
            await Topic.next(context, instanceName);
        } else if (data.lifecycle === TopicLifecycle.complete) {
            await Topic.complete(context, instance, data.args);
        }
    }

    static async dispatch (
        context: BotContext,
        instanceName: string,
    ): Promise<void> {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any>;

        await topic._onReceive(context, new TopicOnReceiveHelper(context, instance, data));

        if (data.lifecycle === TopicLifecycle.next) {
            await Topic.next(context, instanceName);
        } else if (data.lifecycle === TopicLifecycle.complete) {
            await Topic.complete(context, instance, data.args);
        }
    }

    static async complete <CallbackArgs = any> (
        context: BotContext,
        instance: TopicInstance<any>,
        args: CallbackArgs,
    ) {
        if (!instance.callbackInstanceName) {
            return;
        }
                
        const parentInstance = context.state.conversation.topical.instances[instance.callbackInstanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${instance.callbackInstanceName}`);
            return;
        }

        const topic = Topic.topics[parentInstance.topicName];

        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any>;
    
        const topicCallbackHelper = new TopicCallbackHelper(parentInstance, args, instance.name, data);

        await topic._callbacks[instance.topicName](context, topicCallbackHelper);

        if (data.lifecycle === TopicLifecycle.next) {
            await Topic.next(context, parentInstance.name);
        } else if (data.lifecycle === TopicLifecycle.complete) {
            await Topic.complete(context, parentInstance, data.args);
        }
    }

    init (
        init: TopicInit<State, InitArgs, CallbackArgs, Promiseable<void>>,
    ): this {
        this._init = (context, topic) => toPromise(init(context, topic));
    
        return this;
    }

    next (
        next: TopicNext<State, CallbackArgs, Promiseable<void>>,
    ): this {
        this._next = (context, topic) => toPromise(next(context, topic));

        return this;
    }

    onReceive (
        onReceive: TopicOnReceive<State, CallbackArgs, Promiseable<void>>,
    ): this {
        this._onReceive = (context, instance) => toPromise(onReceive(context, instance));

        return this;
    }

    private _callbacks: {
        [topicName: string]: TopicCallback<any, any, Promise<void>>;
    } = {}

    onComplete <C> (
        topic: Topic<any, any, C>,
        callback: TopicCallback<State, C, Promiseable<void>>,
    ): this {
        if (this._callbacks[topic.name])
            throw new Error(`An attempt was made to create a callback with existing topic named ${topic.name}. Ignored.`);

        this._callbacks[topic.name] = (context, topic) => toPromise(callback(context, topic));

        return this;
    }
}
