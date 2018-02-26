import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
import 'isomorphic-fetch';
// import { BotFrameworkAdapter } from 'botbuilder-services';
// import { createServer } from 'restify';
import { Topic } from './topics';
import { simpleForm, SimpleFormSchema } from './forms';

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

let alarmSchema: SimpleFormSchema = {
    name: {
        type: 'string',
        prompt: 'What do you want to call it?'
    },
    when: {
        type: 'string',
        prompt: 'For when do you want to set it?'
    }
}

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
                topic.instance.state.child = await simpleForm.createInstance(
                    context,
                    {
                        schema: alarmSchema,
                    },
                    topic.instance.name,
                );
            } else if (context.request.text === "show alarms") {
                topic.instance.state.child = await showAlarms.createInstance(context, {
                    alarms: topic.instance.state.alarms
                });
            } else {
                context.reply(`I didn't understand that.`);
            }
        }
    })
    .onComplete(simpleForm, async (context, topic) => {
        topic.instance.state.alarms.push({
            name: topic.args.form['name'],
            when: topic.args.form['when'],
        });
        context.reply(`Alarm successfully added!`);
        topic.instance.state.child = undefined;
    });
