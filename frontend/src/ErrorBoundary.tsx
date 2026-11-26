import {Component} from 'react';
import type {ErrorInfo,ReactNode} from 'react';
import {AlertCircle,RefreshCw} from 'lucide-react';

/** A failed optional view must never remove search, navigation, or country access. */
export default class ViewBoundary extends Component<{children:ReactNode;kind:'map'|'admin'}, {failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.warn(`Optional ${this.props.kind} view unavailable`,error.message,info.componentStack)}
 render(){if(!this.state.failed)return this.props.children;const map=this.props.kind==='map';return <section className={map?'map-failure view-fallback':'view-fallback admin-fallback'} role="status"><AlertCircle size={28}/><h3>{map?'地图暂时不可用':'内容管理暂时无法加载'}</h3><p>{map?'地图资源加载失败。国家列表、搜索、档案与比较仍可继续使用。':'已保存的内容不受影响。其他页面可以继续使用。'}</p><button className="secondary-button" onClick={()=>window.location.reload()}><RefreshCw size={15}/>重新加载当前页面</button></section>}
}
