import { Promiseable } from 'botbuilder';

export const toPromise = <T> (t: Promiseable<T>) => t instanceof Promise ? t : Promise.resolve(t);

interface TopicInstance<State = any> {
    name: string;
    state: State;
    children: string[];
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

type TopicInit <State = any, InitArgs = any> = (context: BotContext, instance: TopicInstance<State>, args: InitArgs) => Promiseable<any>;
type TopicOnReceive <State = any> = (context: BotContext, instance: TopicInstance<State>) => Promiseable<any>;

interface TopicMethods <State = any, InitArgs = any> {
    init: TopicInit<State, InitArgs>;
    onReceive: TopicOnReceive<State>;
}

export class Topic <State = any, InitArgs = any> {
    private static topics: {
        [name: string]: Topic;
    }

    protected init: TopicInit<State, InitArgs>;
    protected onReceive: TopicOnReceive<State>;

    constructor(
        public name: string,
        topicMethods: Partial<TopicMethods<State, InitArgs>>,
    ) {
        if (Topic.topics[name])
            throw new Error(`An attempt was made to create a topic with existing name ${name}. Ignored.`);
        
        this.init = topicMethods.init || (() => {});
        this.onReceive = topicMethods.onReceive || (() => {});

        Topic.topics[name] = this;
    }

    static async createInstance<State = any, InitArgs = any>(
        context: BotContext,
        topic: Topic<State, InitArgs>,
        args?: InitArgs,
    ) {
        const instance: TopicInstance<State> = {
            name: topic.name,
            state: {} as State,
            children: [],
        }

        await toPromise(topic.init(context, instance, args));

        context.state.conversation.topics.instances[Date.now().toString()] = instance;

        return instance;
    }  
}

