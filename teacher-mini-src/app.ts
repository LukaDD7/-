import { teacherStore } from './store';
App({onLaunch(){teacherStore.load();}});
