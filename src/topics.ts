import { Promiseable } from 'botbuilder';

export const toPromise = <T> (t: Promiseable<T>) => t instanceof Promise ? t : Promise.resolve(t);

class TopicInstance <State = any> {
    constructor(
        public topicName: string,
        public state = {} as State,
    ) {
    }
}

declare global {
    interface ConversationState {
        topics: {
            instances: {
                [instanceName: string]: TopicInstance;
            }
            rootInstanceName: string;
        },
    }
}

type TopicInit <
    State = any,
    InitArgs = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    instance: Instance,
    args: InitArgs,
) => Promiseable<void>;

type NormalizedTopicInit <
    State = any,
    InitArgs = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    instance: Instance,
    args: InitArgs,
) => Promise<void>;

const normalizedTopicInit = <
    State = any,
    InitArgs = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> (
    init: TopicInit<State, InitArgs, Instance>
): NormalizedTopicInit<State, InitArgs, Instance> => (
    context,
    instance,
    args
) => init
    ? toPromise(init(context, instance, args))
    : Promise.resolve();

type TopicOnReceive <
    State = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    instance: Instance,
) => Promiseable<void>;

type NormalizedTopicOnReceive <
    State = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    instance: Instance,
) => Promise<void>;

const normalizedTopicOnReceive = <
    State = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> (
    onReceive: TopicOnReceive<State, Instance>
): NormalizedTopicOnReceive<State, Instance> =>
(
    context,
    instance
) => onReceive
    ? toPromise(onReceive(context, instance))
    : Promise.resolve();

interface TopicMethods <
    State = any,
    InitArgs = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> {
    init: TopicInit<State, InitArgs, Instance>;
    onReceive: TopicOnReceive<State, Instance>;
}

export class Topic <
    State = any,
    InitArgs = any,
> {
    private static topics: {
        [name: string]: Topic;
    }

    protected init: NormalizedTopicInit<State, InitArgs>;
    protected onReceive: NormalizedTopicOnReceive<State>;

    constructor (
        public name: string,
        topicMethods: Partial<TopicMethods<State, InitArgs, TopicInstance<State>>>,
    ) {
        if (Topic.topics[name])
            throw new Error(`An attempt was made to create a topic with existing name ${name}. Ignored.`);
        
        this.init = normalizedTopicInit(topicMethods.init);
        this.onReceive = normalizedTopicOnReceive(topicMethods.onReceive);

        Topic.topics[name] = this;
    }

    protected async saveInstance (
        context: BotContext,
        instance: TopicInstance<State>,
        args?: InitArgs,
    ) {
        await toPromise(this.init(context, instance, args));

        const instanceName = Date.now().toString();
        context.state.conversation.topics.instances[instanceName] = instance;
        return instanceName;
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            new TopicInstance(this.name),
            args,
        );
    }

    static setRoot (
        context: BotContext,
        instanceName: string,
    ) {
        context.state.conversation.topics.rootInstanceName = instanceName;
    }

    static dispatchToInstance (
        context: BotContext,
        instanceName: string,
    ): Promise<void> {
        const instance = context.state.conversation.topics.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return Promise.resolve();
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return Promise.resolve();
        }

        return topic.onReceive(context, instance);
    }
}

type TopicCallback <
    State = any,
    Response = any,
> = (
    context: BotContext,
    response: Response,
    instance: TopicInstance<State>,
) => Promiseable<void>;

type NormalizedTopicCallback <
    State = any,
    Response = any,
> = (
    context: BotContext,
    response: Response,
    instance: TopicInstance<State>,
) => Promise<void>;

const normalizedTopicCallback = <
    State = any,
    Response = any,
> (
    callback: TopicCallback<State, Response>
): NormalizedTopicCallback<State, Response> => (
    context,
    response,
    instance,
) => callback
    ? toPromise(callback(context, response, instance))
    : Promise.resolve();

interface TopicMethodsWithCallback <
    State = any,
    InitArgs = any,
    Response = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> extends TopicMethods<State, InitArgs, Instance> {
    callback: TopicCallback<State, Response>;
}

export abstract class TopicWithCallbacks <
    State = any,
    InitArgs = any,
    Response = any,
> extends Topic<State, InitArgs> {
    protected callback: TopicCallback<State, Response>;

    constructor (
        name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response>>,
    ) {
        super(name, topicMethods);
        this.callback = normalizedTopicCallback(topicMethods.callback);
    }
}

class TopicInstanceWithChild <State = any> extends TopicInstance<State> {
    constructor(
        topicName: string,
        state = {} as State,
        public child = undefined as string,
    ) {
        super(topicName, state);
    }
}

export class TopicWithChild <
    State = any,
    InitArgs = any,
    Response = any,
> extends TopicWithCallbacks<State, InitArgs, Response> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response, TopicInstanceWithChild<State>>>,
    ) {
        super (name, topicMethods);
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            new TopicInstanceWithChild(this.name),
            args,
        );
    }
}

class TopicInstanceWithChildren <State = any> extends TopicInstance <State> {
    constructor(
        topicName: string,
        state = {} as State,
        public children = [] as string[],
    ) {
        super(topicName, state);
    }
}

export class TopicWithChildren <
    State = any,
    InitArgs = any,
    Response = any,
> extends TopicWithCallbacks <State, InitArgs, Response> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response, TopicInstanceWithChildren<State>>>,
    ) {
        super (name, topicMethods);
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            new TopicInstanceWithChildren(this.name),
            args,
        );
    }
}
