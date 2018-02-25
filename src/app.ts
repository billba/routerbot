import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
// import { BotFrameworkAdapter } from 'botbuilder-services';
import 'isomorphic-fetch';
// import { createServer } from 'restify';
import { Topic } from './topics';

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
    .onReceive(context => {
        Topic.do(context, () => alarmBot.createInstance(context));
    });

interface Alarm {
    name: string;
    when: Date;
}

interface AlarmBot {
    child: string;
    alarms: Alarm[];
}

const setAlarm = new Topic<Partial<Alarm>, Partial<Alarm>, Alarm>('addAlarm', {
    init (context, topic) {
        topic.instance.state = topic.args;
        context.reply(`Let's fake setting an alarm. Type "done".`);
    },

    async onReceive (context, topic) {
        if (context.request.type === 'message') {
            if (context.request.text === 'done') {
                topic.complete({
                    name: "dog",
                    when: new Date(),
                });
            }  else {
                context.reply(`I really didn't understand that.`);
            }
        }
    }
});

const showAlarms = new Topic<undefined, { alarms: Alarm[] }>('showAlarms', {
    init (context, topic) {
        context.reply(`You have the following alarms set:`);
        topic.args.alarms.forEach(alarm => context.reply(`${alarm.name} for ${alarm.when}`));
        topic.complete();
    }
});

const alarmBot = new Topic<AlarmBot>('alarmBot', {
    init (context, topic) {
        context.reply(`Welcome to Alarm Bot! I know how to set, show, and delete alarms.`);
        topic.instance.state.child = undefined;
        topic.instance.state.alarms = [];
    },

    async onReceive (context, topic) {
        if (topic.instance.state.child)
            return Topic.dispatchToInstance(context, topic.instance.state.child);
        else if (context.request.type === 'message') {
            if (context.request.text === "set alarm") {
                topic.instance.state.child = await setAlarm.createInstance(context, topic.instance.name);
            } else if (context.request.text === "show alarms") {
                topic.instance.state.child = await showAlarms.createInstance(context, {
                    alarms: topic.instance.state.alarms
                });
            } else {
                context.reply(`I didn't understand that.`);
            }
        }
    }
});

alarmBot.onComplete(setAlarm, async (context, topic) => {
    if (topic.args) {
        topic.instance.state.alarms.push(topic.args);
        context.reply(`Alarm successfully added!`);
        topic.instance.state.child = undefined;
    }
});
