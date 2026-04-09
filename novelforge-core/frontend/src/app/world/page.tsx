'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { Globe2, Map, Book, Scale, Clock, Database, DatabaseZap } from 'lucide-react';
import LocationMap from '@/components/World/LocationMap';
import CulturePanel from '@/components/World/CulturePanel';
import HistoricalTimeline from '@/components/World/HistoricalTimeline';
import RuleHierarchyTree from '@/components/World/RuleHierarchyTree';

export default function WorldSettingsPage() {
  const worldSetting = useAppStore(state => state.worldSetting);
  const timeline = useAppStore(state => state.timeline);
  
  const [activeTab, setActiveTab] = useState<'timeline' | 'locations' | 'cultures' | 'rules'>('timeline');

  // 空状态判定：所有的世界数据都为空
  const isEmpty = !worldSetting && (!timeline || timeline.length === 0);

  const TABS = [
    { id: 'timeline', label: '编年史', icon: Clock, count: timeline?.length || 0 },
    { id: 'locations', label: '地貌与坐标', icon: Map, count: worldSetting?.locations?.length || 0 },
    { id: 'cultures', label: '文明图鉴', icon: Book, count: worldSetting?.cultures?.length || 0 },
    { id: 'rules', label: '真理之树', icon: Scale, count: worldSetting?.rules?.length || 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶部环境光与装饰 */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10 flex flex-col min-h-screen">
        
        {/* 页头区域 */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 pb-8 border-b border-slate-800">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 flex items-center bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              <Globe2 className="w-10 h-10 mr-4 text-emerald-500" />
              世界观测仓
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl">
              这里是支撑小说运转的底层架构。时间和空间的经纬交织，文明与法则相互碰撞。
              {worldSetting?.name && <span className="text-emerald-400 block mt-2 font-medium">当前代号：{worldSetting.name}</span>}
              {worldSetting?.description && <span className="text-sm block mt-1 opacity-80">{worldSetting.description}</span>}
            </p>
          </div>
          
          <button className="mt-6 md:mt-0 flex items-center whitespace-nowrap bg-slate-900 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 text-white py-2.5 px-5 rounded-xl transition-all shadow-lg">
            <DatabaseZap className="w-4 h-4 mr-2 text-emerald-400" />
            干涉世界参数
          </button>
        </div>

        {isEmpty ? (
           <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20 backdrop-blur-sm mt-12 py-24">
             <Database className="w-16 h-16 text-slate-700 mb-6" />
             <h3 className="text-2xl font-bold text-slate-300 mb-2">混沌虚无之地</h3>
             <p className="text-slate-500 max-w-md text-center">
               目前世界尚在孕育之中，没有任何规则、地点或历史发生。请通过前方的 AI 规划生成或直接导入文本。
             </p>
           </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 flex-1">
            
            {/* 左侧控制台导航 */}
            <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`
                      w-full relative flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 text-left
                      ${isActive 
                        ? 'bg-gradient-to-r from-blue-600/20 to-emerald-600/20 border border-blue-500/30 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                        : 'bg-slate-900/50 border border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
                    `}
                  >
                    <div className="flex items-center">
                      <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-cyan-400 font-bold' : ''}`} />
                      <span className={`font-semibold ${isActive ? 'tracking-wide' : ''}`}>{tab.label}</span>
                    </div>
                    {tab.count > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'bg-slate-800 text-slate-500'}`}>
                        {tab.count}
                      </span>
                    )}
                    {/* 左侧发光细柱 */}
                    {isActive && <div className="absolute left-0 inset-y-2 w-1 bg-cyan-400 rounded-r-full shadow-[0_0_10px_#22d3ee]" />}
                  </button>
                );
              })}
            </div>

            {/* 右侧展示面板 （应用一层深色覆写避免白色组件太刺眼） */}
            <div className="flex-1 bg-slate-900/40 rounded-3xl border border-slate-800 p-6 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
              <style dangerouslySetInnerHTML={{__html: `
                /* 强制组件覆盖暗色主题 - 小幅Hack避免全面重构四百行Card层组件 */
                .world-panel-container .bg-card { background-color: transparent !important; border: none !important; box-shadow: none !important; color: #f1f5f9; }
                .world-panel-container .text-card-foreground { color: #f8fafc; }
                .world-panel-container .text-muted-foreground { color: #94a3b8; }
                .world-panel-container .border { border-color: #1e293b; }
                .world-panel-container .bg-muted { background-color: #0f172a; }
                .world-panel-container .bg-background { background-color: #020617; color: white;}
                .world-panel-container select { background-color: #0f172a; border-color: #1e293b;}
              `}} />
              
              <div className="world-panel-container h-full">
                {activeTab === 'timeline' && <HistoricalTimeline events={timeline || []} />}
                {activeTab === 'locations' && <LocationMap locations={worldSetting?.locations || []} />}
                {activeTab === 'cultures' && <CulturePanel cultures={worldSetting?.cultures || []} />}
                {activeTab === 'rules' && <RuleHierarchyTree rules={worldSetting?.rules || []} />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}