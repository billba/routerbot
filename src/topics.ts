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
        private data: TopicInitHelperData <CallbackArgs>
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

interface TopicInitHelperData <CallbackArgs> {
    lifecycle?: TopicLifecycle.next | TopicLifecycle.complete | TopicLifecycle.dispatch;
    args?: CallbackArgs;
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
        private data: TopicNextHelperData<CallbackArgs>,
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

interface TopicNextHelperData <CallbackArgs> {
    lifecycle?: TopicLifecycle.next | TopicLifecycle.complete;
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
        private data: TopicOnReceiveHelperData<CallbackArgs>,
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

interface TopicOnReceiveHelperData <CallbackArgs> {
    lifecycle?: TopicLifecycle.next | TopicLifecycle.complete;
    args?: CallbackArgs
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
    ) {
    }
}

const returnsPromiseVoid = () => Promise.resolve();

export class Topic <
    State = any,
    InitArgs extends {} = {},
    CallbackArgs = any,
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected _init: TopicInit<State, InitArgs, CallbackArgs, Promise<void>>;
    protected _next: TopicNext<State, CallbackArgs, Promise<void>>;
    protected _onReceive: TopicOnReceive<State, CallbackArgs, Promise<void>>;

    constructor (
        public name: string,
    ) {
        if (Topic.topics[name])
            throw new Error(`An attempt was made to create a topic with existing name ${name}. Ignored.`);
        
        this._init = returnsPromiseVoid;
        this._onReceive = returnsPromiseVoid;
        Topic.topics[name] = this;
    }

    protected saveInstance (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        instance.name = Date.now().toString();
        context.state.conversation.topical.instances[instance.name] = instance;
        return instance.name;
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
     
        const data = {} as TopicInitHelperData<CallbackArgs>;
        const instance = new TopicInstance<State>(this.name, callbackInstanceName);

        await toPromise(this._init(context, new TopicInitHelper(context, instance, args, data)));
        if (data.lifecycle === TopicLifecycle.complete) {
            await Topic.complete(context, instance, data.args);
            return undefined;
        } else {
            const instanceName = this.saveInstance(context, instance);
            if (data.lifecycle === TopicLifecycle.next) {
                await Topic.next(context, instanceName);
            } else if (data.lifecycle === TopicLifecycle.dispatch) {
                await Topic.dispatch(context, instanceName);
            }
            return instanceName;
        }
    }

    static async do(
        context: BotContext,
        getRootInstanceName: () => Promise<string>
    ) {
        if (!context.state.conversation.topical) {
            context.state.conversation.topical = {
                instances: {},
                rootInstanceName: undefined
            }
            context.state.conversation.topical.rootInstanceName = await getRootInstanceName();
        } else {
            await Topic.dispatch(context, context.state.conversation.topical.rootInstanceName);
        }
    }

    static async next (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return Promise.resolve();
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return Promise.resolve();
        }

        const data = {} as TopicNextHelperData<any>;

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
            return Promise.resolve();
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return Promise.resolve();
        }

        const data = {} as TopicOnReceiveHelperData<any>;

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
        if (!instance.callbackInstanceName)
            return;
                
        const parentInstance = context.state.conversation.topical.instances[instance.callbackInstanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${instance.callbackInstanceName}`);
            return Promise.resolve();
        }

        const topic = Topic.topics[parentInstance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return Promise.resolve();
        }

        const topicCallbackHelper = new TopicCallbackHelper(parentInstance, args, instance.name);

        await topic._callbacks[instance.topicName](context, topicCallbackHelper);
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
