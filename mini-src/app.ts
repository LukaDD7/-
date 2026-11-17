import {store} from './store';
App({onShow(){if(!store.snapshot().user)void store.boot();else void store.refresh();},onHide(){store.onHide();}});
