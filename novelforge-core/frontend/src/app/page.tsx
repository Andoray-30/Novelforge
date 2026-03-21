'use client';

import { useState, useEffect } from 'react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessageList, Message } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ArtifactPanel } from '@/components/chat/ArtifactPanel';
import { LandingPage } from '@/components/landing/LandingPage';
import { BookOpen, Sparkles, Wand2, PanelLeft } from 'lucide-react';

export default function ChatPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactPanelVisible, setArtifactPanelVisible] = useState(false);
  
  // 当前会话状态
  const [currentSessionId, setCurrentSessionId] = useState('session-1');
  
  // 选中的/正在预览的右侧产物
  const [activeArtifact, setActiveArtifact] = useState<Message['artifact'] | null>(null);

  // 初始化带有示范数据的消息流
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-sys-1',
      role: 'system',
      content: 'Welcome to NovelForge Agent.',
      timestamp: new Date(),
    },
    {
      id: 'msg-agent-1',
      role: 'assistant',
      content: '**你好！** 我是 NovelForge 专属小说设计 Agent。\\n从世界观设定、角色关系构建到全书故事线起草，我们都可以通过对话来完成。\\n目前你想从哪一部分开始构思？',
      timestamp: new Date(Date.now() - 60000),
    },
    {
      id: 'msg-user-1',
      role: 'user',
      content: '帮我设计一个反派角色，叫做“林无明”，他是个瞎子剑客。',
      timestamp: new Date(Date.now() - 50000),
    },
    {
      id: 'msg-agent-2',
      role: 'assistant',
      content: '收到，基于你的设想，我已经为你构建了“林无明”这个角色的详细核心大纲与初步关系猜想，请在右侧查阅。后续我们可以继续深挖他的执念。',
      timestamp: new Date(Date.now() - 40000),
      // 携带一个实体卡片数据，右侧展示
      artifact: {
        type: 'character_card',
        title: '林无明 - 夜眼剑豪',
        data: {
          姓名: '林无明',
          别号: '夜眼、盲剑客',
          外貌: '双目缠绕陈旧黑绫，身形如竹，常穿灰白破布长衫，腰悬无鞘黑铁细剑。',
          核心动因: '寻找当年用剑光灼瞎自己双眼，却留下“看到真理”预言的师傅。',
          能力设定: {
             心眼: '十步之内，听风辨位极其敏锐，能看穿一切灵力波动。',
             黯蚀剑法: '拔剑无光，仿佛能吞噬周遭光线。'
          },
          性格特征: '表面冷漠如冰，实则对待一诺千金极其狂热。'
        }
      }
    }
  ]);

  // 处理登录
  const handleLogin = () => {
    setIsLoggedIn(true);
    window.scrollTo(0, 0);
  };

  // 处理用户发送消息
  const handleSendMessage = (text: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setArtifactPanelVisible(false);

    setTimeout(() => {
      const agentMsg: Message = {
        id: `msg-agent-${Date.now()}`,
        role: 'assistant',
        content: '这是一个前端结构预览的默认回复体验版。\\n> 当前，你已经完成了对界面质感的搭建！\\n接下来可以修改 `frontend` 中的 API 请求钩子，真正连通你的后端 FastAPI。祝你代码顺利！',
        timestamp: new Date(),
        isStreaming: false, 
      };
      setMessages(prev => [...prev, agentMsg]);
    }, 1500);
  };

  // 展开右栏查看 Artifact
  const handlePreviewArtifact = (artifact: Message['artifact']) => {
    if (!artifact) return;
    setActiveArtifact(artifact);
    setArtifactPanelVisible(true);
  };

  // 渲染 Landing 门户
  if (!isLoggedIn) {
    return <LandingPage onLogin={handleLogin} />;
  }

  return (
    <div 
      className="message-animate"
      style={{ 
        display: 'flex', 
        height: '100vh', 
        width: '100vw', 
        overflow: 'hidden',
        background: 'var(--bg-base)',
        animationDuration: '0.8s'
      }}
    >
      <ChatSidebar 
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewSession={() => {}}
        onDeleteSession={() => {}}
        sessions={[
          { id: 'session-1', title: '《盲剑客》初始设定', preview: '帮我设计一个反派叫做林无明...', time: '' },
          { id: 'session-2', title: '星际征途世界观探讨', preview: '如果要设定一个赛博仙侠世界...', time: '' },
        ]}
      />

      <main 
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          position: 'relative',
          minWidth: 0 
        }}
      >
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="展开侧边栏"
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 50,
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
              transition: 'background 200ms, color 200ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            <PanelLeft size={18} />
          </button>
        )}

        {messages.length <= 1 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.4)',
              marginBottom: 24
            }}>
              <Wand2 size={32} color="white" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              有什么故事想写出来的吗？
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>与 NovelForge 的 AI 一起探索灵感边界</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
               onClick={(e) => {
                 const target = (e.target as HTMLElement).closest('[data-artifact-id]');
                 if (target) {
                   const id = target.getAttribute('data-artifact-id');
                   const msg = messages.find(m => m.id === id);
                   if (msg?.artifact) {
                      handlePreviewArtifact(msg.artifact);
                   }
                 }
               }}
          >
            <MessageList messages={messages.filter(m => m.role !== 'system')} />
          </div>
        )}

        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
          <ChatInput onSend={handleSendMessage} />
        </div>
      </main>

      <ArtifactPanel 
        visible={artifactPanelVisible} 
        onClose={() => setArtifactPanelVisible(false)}
        artifact={activeArtifact || null} 
      />
    </div>
  );
}