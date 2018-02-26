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
    .onReceive(async context => {
        await Topic.do(context, () => alarmBot.createInstance(context));
    });

interface Alarm {
    name: string;
    when: string;
}

interface AlarmBot {
    child: string;
    alarms: Alarm[];
}

interface SetAlarmState {
    alarm: Partial<Alarm>;
    prompt: string;
}

const setAlarm = new Topic<SetAlarmState, Partial<Alarm>, Alarm>('addAlarm')
    .init((context, topic) => {
        topic.instance.state.alarm = topic.args;
        topic.next();
    })
    .next((context, topic) => {
        if (!topic.instance.state.prompt) {
            if (!topic.instance.state.alarm.name) {
                context.reply(`What would you like to name it?`);
                topic.instance.state.prompt = 'name';
                return;
            }
            
            if (!topic.instance.state.alarm.when) {
                context.reply(`For when would you like to set it?`);
                topic.instance.state.prompt = 'when';
                return;
            }

            topic.complete(topic.instance.state.alarm as Alarm)
        }
    })
    .onReceive(async (context, topic) => {
        if (context.request.type === 'message') {
            switch (topic.instance.state.prompt) {
                case 'name': {
                    topic.instance.state.alarm.name = context.request.text;
                    topic.instance.state.prompt = undefined;
                    topic.next();
                    return;
                }
                case 'when': {
                    topic.instance.state.alarm.when = context.request.text;
                    topic.instance.state.prompt = undefined;
                    topic.next();
                    return;
                }
                default: {
                    context.reply(`I really didn't understand that.`);
                    return;
                }
            }            
        }
    });

const showAlarms = new Topic<undefined, { alarms: Alarm[] }>('showAlarms')
    .init((context, topic) => {
        context.reply(`You have the following alarms set:`);
        topic.args.alarms.forEach(alarm => context.reply(`${alarm.name} for ${alarm.when}`));
        topic.complete();
    });

const alarmBot = new Topic<AlarmBot>('alarmBot')
    .init((context, topic) => {
        context.reply(`Welcome to Alarm Bot! I know how to set, show, and delete alarms.`);
        topic.instance.state.alarms = [];
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            return Topic.dispatch(context, topic.instance.state.child);
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
    })
    .onComplete(setAlarm, async (context, topic) => {
        if (topic.args) {
            topic.instance.state.alarms.push(topic.args);
            context.reply(`Alarm successfully added!`);
            topic.instance.state.child = undefined;
        }
    });
