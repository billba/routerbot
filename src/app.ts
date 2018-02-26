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

interface SetAlarmState {
    alarm: Partial<Alarm>;
    child: string;
}

const promptForName = new Topic<any, any, { name: string }>('promptForName')
    .init((context, topic) => {
        context.reply(`What would you like to name it?`);
    })
    .onReceive((context, topic) => {
        topic.complete({
            name: context.request.text
        })
    });

const promptForWhen = new Topic<any, any, { when: string }>('promptForWhen')
    .init((context, topic) => {
        context.reply(`For when would you like to set it?`);
    })
    .onReceive((context, topic) => {
        topic.complete({
            when: context.request.text
        })
    });

const setAlarm = new Topic<SetAlarmState, Partial<Alarm>, Alarm>('addAlarm')
    .init((context, topic) => {
        topic.instance.state.alarm = topic.args;
        topic.next();
    })
    .next(async (context, topic) => {
        if (!topic.instance.state.alarm.name) {
            topic.instance.state.child = await promptForName.createInstance(context, topic.instance.name);
            return;
        }
        
        if (!topic.instance.state.alarm.when) {
            topic.instance.state.child = await promptForWhen.createInstance(context, topic.instance.name);
            return;
        }

        topic.complete(topic.instance.state.alarm as Alarm)
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            return Topic.dispatch(context, topic.instance.state.child);
        
        if (context.request.type === 'message') {
            context.reply(`I really didn't understand that.`);
        }
    })
    .onComplete(promptForName, (context, topic) => {
        topic.instance.state.alarm.name = topic.args.name;
        topic.instance.state.child = undefined;
        topic.next();
    })
    .onComplete(promptForWhen, (context, topic) => {
        topic.instance.state.alarm.when = topic.args.when;
        topic.instance.state.child = undefined;
        topic.next();
    })

const showAlarms = new Topic<undefined, { alarms: Alarm[] }>('showAlarms')
    .init((context, topic) => {
        context.reply(`You have the following alarms set:`);
        topic.args.alarms.forEach(alarm => context.reply(`${alarm.name} for ${alarm.when}`));
        topic.complete();
    });

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const alarmBot = new Topic<AlarmBotState>('alarmBot')
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
