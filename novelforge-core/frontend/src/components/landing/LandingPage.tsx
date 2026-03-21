'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Sparkles, ArrowRight, ShieldCheck, Zap, Globe } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

export function LandingPage({ onLogin }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const [isMounting, setIsMounting] = useState(false);

  useEffect(() => {
    setIsMounting(true);
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="dots-bg" style={{ 
      minHeight: '200vh', 
      background: 'var(--bg-base)', 
      color: 'var(--text-primary)',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* 扫描线 */}
      <div className="scanline" />

      {/* 顶部导航 */}
      <nav style={{
        position: 'fixed',
        top: 0,
        width: '100%',
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 100,
        transition: 'all 300ms',
        background: scrolled ? 'rgba(9, 9, 11, 0.8)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border-subtle)' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <BookOpen size={18} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>NovelForge</span>
        </div>
        <button 
          onClick={onLogin}
          style={{
            padding: '8px 20px',
            borderRadius: 999,
            background: 'white',
            color: 'black',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            border: 'none',
            transition: 'transform 200ms'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          立即开启
        </button>
      </nav>

      {/* Hero Section */}
      <section style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 20px',
        position: 'relative'
      }}>
        <div className="hero-glow animate-pulse-glow" style={{ top: '20%' }} />
        
        <div className="reveal-text" style={{ animationDelay: '0.2s' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            color: '#a78bfa',
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 24,
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            <Sparkles size={14} />
            下一代 AI 小说设计师
          </div>
        </div>

        <h1 className="reveal-text" style={{ 
          fontSize: 'clamp(3rem, 8vw, 6rem)', 
          fontWeight: 800, 
          lineHeight: 1.1,
          letterSpacing: '-0.04em',
          marginBottom: 24,
          animationDelay: '0.4s'
        }}>
          铸造<span className="gradient-text">灵魂</span><br />
          编织幻想的边界
        </h1>

        <p className="reveal-text" style={{ 
          maxWidth: 600, 
          fontSize: 18, 
          color: 'var(--text-muted)',
          marginBottom: 40,
          lineHeight: 1.6,
          animationDelay: '0.6s'
        }}>
          超越单纯的文本生成。与 NovelForge Agent 深度对话，<br />
          从零构建逻辑严密、情感丰满的小说世界。
        </p>

        <div className="reveal-text" style={{ animationDelay: '0.8s' }}>
          <button 
            onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
            style={{
              padding: '16px 32px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              color: 'white',
              fontWeight: 600,
              fontSize: 16,
              cursor: 'pointer',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)'
            }}
          >
            探索无限可能
            <ArrowRight size={20} />
          </button>
        </div>

        {/* 装饰物 */}
        <div className="animate-float" style={{ position: 'absolute', right: '15%', top: '30%', opacity: 0.2 }}>
          <Zap size={120} color="#8b5cf6" strokeWidth={1} />
        </div>
        <div className="animate-float" style={{ position: 'absolute', left: '10%', bottom: '20%', opacity: 0.15, animationDelay: '1s' }}>
          <Globe size={160} color="#6366f1" strokeWidth={1} />
        </div>
      </section>

      {/* Login / Features Section */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '100px 20px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>准备好开始了吗？</h2>
          <p style={{ color: 'var(--text-muted)' }}>登录您的 NovelForge 账号，接续未竟的传奇。</p>
        </div>

        <div className="gradient-border" style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ padding: 40, background: 'var(--bg-surface)', borderRadius: 'inherit' }}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>账号 / Email</label>
              <input 
                type="text" 
                placeholder="novelforge@cyber.com"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'white',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>秘钥 / Password</label>
              <input 
                type="password" 
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'white',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
            <button 
              onClick={onLogin}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 10,
                background: 'white',
                color: 'black',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                border: 'none',
                marginBottom: 16
              }}
            >
              登 录
            </button>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-disabled)', cursor: 'pointer' }}>
                还没有账号？<span style={{ color: 'var(--accent-primary)' }}>立即创建</span>
              </span>
            </div>
          </div>
        </div>

        {/* 信任标识 */}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 40, opacity: 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <ShieldCheck size={16} /> 高安全级 AI 算力
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <Sparkles size={16} /> 独家剧情逻辑引擎
          </div>
        </div>
      </section>

      {/* 底部装饰 */}
      <footer style={{
        padding: '40px',
        textAlign: 'center',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 13,
        color: 'var(--text-disabled)'
      }}>
        © 2026 NovelForge Cyber Engine. All Rights Reserved.
      </footer>
    </div>
  );
}
