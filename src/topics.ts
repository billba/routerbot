import { Promiseable } from 'botbuilder';

export const toPromise = <T> (t: Promiseable<T>) => t instanceof Promise ? t : Promise.resolve(t);

interface TopicInstance<State = any> {
    name: string;
    state: State;
}

declare global {
    interface ConversationState {
        topics: {
            instances: {
                [instanceName: string]: TopicInstance;
            }
            rootInstance: string;
        }
    }
}


type TopicInit <State = any, InitArgs = any> = (context: BotContext, state: State, args: InitArgs) => Promiseable<any>;
type NormalizedTopicInit <State = any, InitArgs = any> = (context: BotContext, state: State, args: InitArgs) => Promise<any>;

const normalizedTopicInit = <State = any, InitArgs = any> (
    init: TopicInit<State, InitArgs>
): NormalizedTopicInit<State, InitArgs> =>
(context: BotContext, state: State, args?: InitArgs) => init
    ? toPromise(init(context, state, args))
    : Promise.resolve();

type TopicOnReceive <State = any> = (context: BotContext, state: State) => Promiseable<any>;
type NormalizedTopicOnReceive <State = any> = (context: BotContext, state: State) => Promise<any>;

const normalizedTopicOnReceive = <State = any, InitArgs = any> (
    onReceive: TopicOnReceive<State>
): NormalizedTopicOnReceive<State> =>
(context: BotContext, state: State) => onReceive
    ? toPromise(onReceive(context, state))
    : Promise.resolve();

interface TopicMethods <State = any, InitArgs = any> {
    init: TopicInit<State, InitArgs>;
    onReceive: TopicOnReceive<State>;
}

export class Topic <State = any, InitArgs = any> {
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

    static async createInstance<State = any, InitArgs = any> (
        context: BotContext,
        topic: Topic<State, InitArgs>,
        args?: InitArgs,
    ) {
        const state = {} as State;

        await toPromise(topic.init(context, state, args));

        const instance: TopicInstance<State> = {
            name: Date.now().toString(),
            state,
        }

        context.state.conversation.topics.instances[Date.now().toString()] = instance;

        return instance;
    }  
}

interface StateWithChild <State = any> {
    child: string;
    state: State;
}

export class TopicWithChild  <State = any, InitArgs = any> extends Topic <StateWithChild<State>, InitArgs> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethods<StateWithChild<State>, InitArgs>>,
    ) {
        super (name, {
            init: (context, state, args) => normalizedTopicInit(topicMethods.init)(
                context, {
                    state: state.state,
                    child: undefined
                } as StateWithChild<State>,
                args
            ),
            
            onReceive: (context, state) => normalizedTopicOnReceive(topicMethods.onReceive)(
                context, {
                    state: state.state, 
                    child: undefined
                } as StateWithChild<State>
            )
        });
    }
}

interface StateWithChildren <State = any> {
    children: string[];
    state: State;
}

export class TopicWithChildren  <State = any, InitArgs = any> extends Topic <StateWithChildren<State>, InitArgs> {
    constructor (
        public name: string,
        topicMethods: Partial<TopicMethods<StateWithChildren<State>, InitArgs>>,
    ) {
        super (name, {
            init: (context, state, args) => normalizedTopicInit(topicMethods.init)(
                context, {
                    state: state.state,
                    children: []
                } as StateWithChildren<State>,
                args
            ),
            
            onReceive: (context, state) => normalizedTopicOnReceive(topicMethods.onReceive)(
                context, {
                    state: state.state, 
                    children: []
                } as StateWithChildren<State>
            )
        });
    }
}

let foo = new TopicWithChildren<{dog: string}>('bill', {
    init(context, state) {
        state.state.dog = "foo"
    }
})