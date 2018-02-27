import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
import 'isomorphic-fetch';
// import { BotFrameworkAdapter } from 'botbuilder-services';
// import { createServer } from 'restify';
import { Topic } from 'botbuilder-topical';
import { SimpleForm } from 'botbuilder-topical';
import { StringPrompt } from 'botbuilder-topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use({
        postActivity(context, activities, next) {
            for (let activity of activities) {
                if (activity.type === 'message')
                    activity.text = "> " + activity.text;
            }
            return next();
        }
    })
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

interface ShowAlarmInitArgs {
    alarms: Alarm[]
}

const showAlarms = new Topic<any, ShowAlarmInitArgs>('showAlarms')
    .init((context, topic) => {
        context.reply(`You have the following alarms set:`);
        topic.args.alarms.forEach(alarm => context.reply(`"${alarm.name}" for ${alarm.when}`));
        topic.complete();
    });

interface DeleteAlarmInitArgs {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    confirm: boolean;
    child: string;
}

interface DeleteAlarmCallbackArgs {
    alarmName: string;
}

const stringPrompt = new StringPrompt('stringPrompt');

const deleteAlarm = new Topic<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmCallbackArgs>('deleteAlarm')
    .init(async (context, topic) => {
        if (topic.args.alarms.length === 0) {
            context.reply(`You don't have any alarms.`);
            topic.complete();
            return;
        }

        topic.instance.state.alarms = topic.args.alarms;

        const names = topic.args.alarms
            .map(alarm => alarm.name)
            .join(', ');

        topic.instance.state.child = await stringPrompt.createInstance(context, topic.instance.name, {
            name: 'whichAlarm',
            prompt: `Which alarm do you want to delete? (${names})`,
        });
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            await Topic.dispatch(context, topic.instance.state.child);
    })
    .onComplete(stringPrompt, async (context, topic) => {
        switch (topic.args.name) {
            case 'whichAlarm':
                topic.instance.state.alarmName = topic.args.value;
                topic.instance.state.child = await stringPrompt.createInstance(context, topic.instance.name, {
                    name: 'confirm',
                    prompt: `Are you sure you want to delete alarm "${topic.args.value}"? (yes/no)"`,
                });
                break;
            case 'confirm':
                topic.complete(topic.args.value === 'yes'
                    ? {
                        alarmName: topic.instance.state.alarmName
                    }
                    : undefined
                )
                break;
        }
    });

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const simpleForm = new SimpleForm('simpleForm');

const alarmBot = new Topic<undefined, AlarmBotState, undefined>('alarmBot')
    .init((context, topic) => {
        context.reply(`Welcome to Alarm Bot! I know how to set, show, and delete alarms.`);
        topic.instance.state.alarms = [];
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            return Topic.dispatch(context, topic.instance.state.child);

        if (context.request.type === 'message') {
            if (/set/i.test(context.request.text)) {
                topic.instance.state.child = await simpleForm.createInstance(context, topic.instance.name, {
                    schema: {
                        name: {
                            type: 'string',
                            prompt: 'What do you want to call it?'
                        },
                        when: {
                            type: 'string',
                            prompt: 'For when do you want to set it?'
                        }
                    }
                });
            } else if (/show/i.test(context.request.text)) {
                topic.instance.state.child = await showAlarms.createInstance(context, {
                    alarms: topic.instance.state.alarms
                });
            } else if (/delete/i.test(context.request.text)) {
                topic.instance.state.child = await deleteAlarm.createInstance(context, topic.instance.name, {
                    alarms: topic.instance.state.alarms
                });
            }
        }
    })
    .onComplete(simpleForm, (context, topic) => {
        topic.instance.state.alarms.push({
            name: topic.args.form['name'],
            when: topic.args.form['when'],
        });

        context.reply(`Alarm successfully added!`);
        
        topic.instance.state.child = undefined;
    })
    .onComplete(deleteAlarm, (context, topic) => {
        if (topic.args) {
            topic.instance.state.alarms = topic.instance.state.alarms
                .filter(alarm => alarm.name !== topic.args.alarmName);

            context.reply(`Alarm "${topic.args.alarmName}" has been deleted.`)
        } else {
            context.reply(`Okay, the status quo has been preserved.`)
        }

        topic.instance.state.child = undefined;
    })
