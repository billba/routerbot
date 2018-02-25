import { Promiseable } from 'botbuilder';

export const toPromise = <T> (t: Promiseable<T>) => t instanceof Promise ? t : Promise.resolve(t);

interface TopicInstance<State = any> {
    readonly topicName: string;
    state: State;
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
    Instance extends TopicInstance<State> = TopicInstance<State>,
> {
    private static topics: {
        [name: string]: Topic;
    }

    protected init: NormalizedTopicInit<State, InitArgs>;
    protected onReceive: NormalizedTopicOnReceive<State>;

    constructor (
        public name: string,
        topicMethods: Partial<TopicMethods<State, InitArgs>>,
    ) {
        if (Topic.topics[name])
            throw new Error(`An attempt was made to create a topic with existing name ${name}. Ignored.`);
        
        this.init = normalizedTopicInit(topicMethods.init);
        this.onReceive = normalizedTopicOnReceive(topicMethods.onReceive);

        Topic.topics[name] = this;
    }

    protected async saveInstance (
        context: BotContext,
        instance: Instance,
        args?: InitArgs,
    ) {
        await toPromise(this.init(context, instance, args));

        context.state.conversation.topics.instances[Date.now().toString()] = instance;

        return instance;
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            {
                topicName: Date.now().toString(),
                state: {} as State,
            } as Instance,
            args,
        );
    }

    static setRoot (
        context: BotContext,
        instanceName: string,
    ) {
        context.state.conversation.topics.rootInstanceName = instanceName;
    }

    static onReceive (
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
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    response: Response,
    instance: Instance,
) => Promiseable<void>;

type NormalizedTopicCallback <
    State = any,
    Response = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> = (
    context: BotContext,
    response: Response,
    instance: Instance,
) => Promise<void>;

const normalizedTopicCallback = <
    State = any,
    Response = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> (
    callback: TopicCallback<State, Response, Instance>
): NormalizedTopicCallback<State, Response, Instance> => (
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
    callback: TopicCallback<State, Response, Instance>;
}

export abstract class TopicWithCallbacks <
    State = any,
    InitArgs = any,
    Response = any,
    Instance extends TopicInstance<State> = TopicInstance<State>,
> extends Topic<State, InitArgs, Instance> {
    protected callback: TopicCallback<State, Response>;

    constructor (
        name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response>>,
    ) {
        super(name, topicMethods);
        this.callback = normalizedTopicCallback(topicMethods.callback);
    }
}

interface TopicInstanceWithChild <State = any> extends TopicInstance <State> {
    child: string;
}

export class TopicWithChild <
    State = any,
    InitArgs = any,
    Response = any,
    Instance extends TopicInstanceWithChild<State> = TopicInstanceWithChild<State>
> extends TopicWithCallbacks<State, InitArgs, Response, Instance> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response, Instance>>,
    ) {
        super (name, topicMethods);
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            {
                topicName: Date.now().toString(),
                state: {} as State,
                child: undefined,
            } as Instance,
            args,
        );
    }
}

interface TopicInstanceWithChildren <State = any> extends TopicInstance <State> {
    children: string[];
}

export class TopicWithChildren <
    State = any,
    InitArgs = any,
    Response = any,
    Instance extends TopicInstanceWithChildren<State> = TopicInstanceWithChildren<State>,
> extends TopicWithCallbacks <State, InitArgs, Response, Instance> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethodsWithCallback<State, InitArgs, Response, Instance>>,
    ) {
        super (name, topicMethods);
    }

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ) {
        return this.saveInstance(
            context,
            {
                topicName: Date.now().toString(),
                state: {} as State,
                children: [],
            } as Instance,
            args,
        );
    }
}

/*

There's an interesting relationship between Topic and TopicInstance.

Probably there are parallel inheritances, e.g. TopicWithChild and TopicInstanceWithChild

But it's a little hard because how do you do new TopicWithChild(...) and then have it call createInstance with the right instance?

I think every Topic has to have a createInstance.

*/