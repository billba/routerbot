import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
// import { BotFrameworkAdapter } from 'botbuilder-services';
import 'isomorphic-fetch';
// import { createServer } from 'restify';
import { Topic, TopicWithChild } from './topics';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use({
        async postActivity(context, activities, next) {
            return await next();
        }
    })
    .onReceive(async context => {
        if (context.request.type === 'message') {

        }
    });

interface Alarm {
    name: string;
    when: Date;
}

interface AlarmBot {
    alarms: Alarm[];
}

const addAlarm = new Topic<Partial<Alarm>, Partial<Alarm>>('addAlarm', {
    init (context, instance, args) {
        instance.state = args;
    }
});

const alarmBot = new TopicWithChild<AlarmBot>('alarmbot', {
    init (context, instance) {
        context.reply(`Welcome to Alarm Bot! I know how to set, show, and delete alarms.`);
        instance.state.alarms = [];
    },

    async onReceive (context, instance) {
        if (instance.child)
            return Topic.onReceive(context, instance.child);
        else if (context.request.type === 'message') {
            if (context.request.text.includes("add alarm")) {
                instance.child = await addAlarm.createInstance(context);
            }
        }
    },

    async callback (context, response, instance) {

    }


});

let context: BotContext;

Topic.setRoot(context, Topic.createInstance(context, profile))