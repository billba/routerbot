import { Promiseable } from 'botbuilder';

const toPromise = <T> (t: Promiseable<T>) => t instanceof Promise ? t : Promise.resolve(t);

interface Callback {
    instanceName: string,
    tag: string,
}

class TopicInstance <State = any> {
    public name: string;
    public state = {} as State;

    constructor(
        public topicName: string,
        public callback?: Callback,
    ) {
    }

}

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

interface TopicInitHelperData <CallbackArgs> {
    complete: boolean;
    args: CallbackArgs;
    dispatch: boolean;
}

class TopicInitHelper <
    State,
    InitArgs,
    CallbackArgs,
    Instance extends TopicInstance<State>,
> {
    constructor(
        private context: BotContext,
        public instance: Instance,
        public args: InitArgs,
        private data: TopicInitHelperData <CallbackArgs>
    ) {
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.dispatch)
            throw "you may call complete() or dispatch() but not both";

        this.data.complete = true;
        this.data.args = args;
    }

    dispatch () {
        if (this.data.complete)
            throw "you may call complete() or dispatch() but not both";
        this.data.dispatch = true;
    }
}

type TopicInit <
    State,
    InitArgs,
    CallbackArgs,
    Instance extends TopicInstance<State>,
    T
> = (
    context: BotContext,
    topic: TopicInitHelper<State, InitArgs, CallbackArgs, Instance>,
) => T;


interface TopicOnReceiveHelperData <CallbackArgs> {
    complete: boolean;
    args: CallbackArgs
}

class TopicOnReceiveHelper <
    State,
    CallbackArgs,
    Instance extends TopicInstance<State>,
> {
    constructor(
        private context: BotContext,
        public instance: Instance,
        private data: TopicOnReceiveHelperData<CallbackArgs>,
    ) {
    }

    complete (
        args: CallbackArgs,
    ) {
        if (!this.instance.callback)
            throw "you need to provide a callback before calling complete()";
        this.data.complete = true;
        this.data.args = args;
    }
}

type TopicOnReceive <
    State,
    CallbackArgs,
    Instance extends TopicInstance<State>,
    T
> = (
    context: BotContext,
    topic: TopicOnReceiveHelper<State, CallbackArgs, Instance>
) => T;

type TopicCallback <
    State,
    Instance extends TopicInstance<State>,
    CallbackArgs,
    T
> = (
    context: BotContext,
    instance: Instance,
    args: CallbackArgs,
    tag: string,
    childInstanceName: string,
) => T;

interface TopicMethods <
    State,
    InitArgs,
    CallbackArgs,
    Instance extends TopicInstance<State>,
> {
    init: TopicInit<State, InitArgs, CallbackArgs, Instance, Promiseable<void>>;
    onReceive: TopicOnReceive<State, CallbackArgs, Instance, Promiseable<void>>;
    callback: TopicCallback<State, Instance, CallbackArgs, Promiseable<void>>;
}

export class Topic <
    State = any,
    InitArgs = any,
    CallbackArgs = any,
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected init: TopicInit<State, InitArgs, CallbackArgs, TopicInstance<State>, Promise<void>>;
    protected onReceive: TopicOnReceive<State, CallbackArgs, TopicInstance<State>, Promise<void>>;
    protected callback: TopicCallback<State, TopicInstance<State>, CallbackArgs, Promise<void>>;

    constructor (
        public name: string,
        topicMethods: Partial<TopicMethods<State, InitArgs, CallbackArgs, TopicInstance<State>>>,
    ) {
        if (Topic.topics[name])
            throw new Error(`An attempt was made to create a topic with existing name ${name}. Ignored.`);
        
        this.init = (context, topic) => toPromise((topicMethods.init || (() => {}))(context, topic));
        this.onReceive = (context, instance) => toPromise((topicMethods.onReceive || (() => {}))(context, instance));
        this.callback = (context, instance, args, tag, childInstanceName) => toPromise((topicMethods.callback || (() => {}))(context, instance, args, tag, childInstanceName));

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

    async createInstance (
        context: BotContext,
        args?: InitArgs,
        callback?: Callback, 
    ) {
        const data = {} as TopicInitHelperData<CallbackArgs>;
        const instance = new TopicInstance<State>(this.name, callback);

        await toPromise(this.init(context, new TopicInitHelper(context, instance, args, data)));
        if (data.complete) {
            if (instance.callback)
                await Topic.completeInstance(context, instance, data.args);
            return undefined;
        } else {
            const instanceName = this.saveInstance(context, instance);
            if (data.dispatch) {
                await Topic.dispatchToInstance(context, instanceName);
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
            await Topic.dispatchToInstance(context, context.state.conversation.topical.rootInstanceName);
        }
    }

    static async dispatchToInstance (
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

        await topic.onReceive(context, new TopicOnReceiveHelper(context, instance, data));

        if (data.complete) {
            await Topic.completeInstance(context, instance, data.args);
        }
    }

    static completeInstance <CallbackArgs = any> (
        context: BotContext,
        instance: TopicInstance<any>,
        args: CallbackArgs,
    ) {
        const callback = instance.callback;

        if (!callback) {
            console.warn(`No callback registered for instance ${instance.name}`);
            return Promise.resolve();
        }

        const parentInstance = context.state.conversation.topical.instances[callback.instanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${callback.instanceName}`);
            return Promise.resolve();
        }

        const topic = Topic.topics[parentInstance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return Promise.resolve();
        }

        return topic.callback(context, parentInstance, args, callback.tag, instance.name);
    }
}


class ParentTopicInstance <State = any> extends TopicInstance <State> {
    public children = [] as string[];

    constructor(
        topicName: string,
        callback?: Callback,
    ) {
        super(topicName, callback);
    }
}
