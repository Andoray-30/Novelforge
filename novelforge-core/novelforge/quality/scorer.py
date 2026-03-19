"""
质量评分系统
基于 aicharactercards.com 标准评估角色卡质量
"""

import re
from typing import Optional
from rich.console import Console

from novelforge.services.tavern_converter import (
    TavernCardV2 as TavernCardV3,
    TavernCardData,
    QualityScore,
    QualityScoreBreakdown,
    QualityGrade,
    TokenEstimate,
    FIELD_LENGTH_GUIDELINES,
    determine_grade,
    QUALITY_THRESHOLDS,
)

console = Console()


class QualityScorer:
    """质量评分器（基于 aicharactercards.com 标准）"""
    
    def score(self, card: TavernCardV3) -> QualityScore:
        """
        评估角色卡质量
        
        评分标准（5个类别，每个0-20分）：
        1. 字段适当性与结构 (0-20)
        2. 角色一致性与身份 (0-20)
        3. 角色扮演实用性与沉浸感 (0-20)
        4. 创意与原创性 (0-20)
        5. 打磨与技术清晰度 (0-20)
        + alternate_greetings 奖励分 (0-5)
        
        Args:
            card: Tavern Card V3 格式的角色卡
            
        Returns:
            质量评分结果
        """
        breakdown = self._calculate_breakdown(card.data)
        total_score = self._sum_breakdown(breakdown)
        grade = determine_grade(total_score)
        suggestions = self._generate_suggestions(card.data, breakdown)
        token_estimate = self._estimate_tokens(card.data)
        
        return QualityScore(
            grade=grade,
            score=total_score,
            breakdown=breakdown,
            suggestions=suggestions,
            token_estimate=token_estimate,
        )
    
    def _calculate_breakdown(self, data: TavernCardData) -> QualityScoreBreakdown:
        """计算各项评分"""
        return QualityScoreBreakdown(
            field_appropriateness=self._score_field_appropriateness(data),
            character_consistency=self._score_character_consistency(data),
            rp_playability=self._score_rp_playability(data),
            creativity=self._score_creativity(data),
            polish=self._score_polish(data),
            alternate_greetings_bonus=self._score_alternate_greetings(data),
        )
    
    def _score_field_appropriateness(self, data: TavernCardData) -> int:
        """
        评分：字段适当性与结构 (0-20)
        
        检查：
        - 必填字段是否为空
        - 内容是否放在正确的字段中
        - 字段长度是否合理
        """
        score = 20
        
        # 检查必填字段
        if not data.name or not data.name.strip():
            score -= 10
        if not data.description or not data.description.strip():
            score -= 5
        if not data.first_mes or not data.first_mes.strip():
            score -= 5
        
        # 检查字段长度
        name_len = len(data.name)
        if name_len > 50:
            score -= 2
        elif name_len < 1:
            score -= 5
        
        desc_len = len(data.description)
        if desc_len < 100:
            score -= 3
        elif desc_len > 2000:
            score -= 2
        
        # 检查内容是否在正确的字段中
        # 如果 description 包含大量性格描述，应该放在 personality 中
        personality_keywords = ["性格", "个性", "脾气", "性格特点", "性格特征"]
        if any(kw in data.description for kw in personality_keywords):
            score -= 2
        
        return max(0, score)
    
    def _score_character_consistency(self, data: TavernCardData) -> int:
        """
        评分：角色一致性与身份 (0-20)
        
        检查：
        - 描述、性格、场景、首条消息是否描述同一个角色
        - 是否有矛盾
        """
        score = 20
        
        # 检查名字一致性
        name = data.name.strip()
        if name:
            # 检查 first_mes 中是否使用 {{char}}
            if data.first_mes and "{{char}}" not in data.first_mes:
                score -= 2
            
            # 检查 mes_example 中是否使用 {{char}}
            if data.mes_example and "{{char}}" not in data.mes_example:
                score -= 2
        
        # 检查性别一致性（简单检查）
        gender_indicators = ["他", "他的", "他是", "男人", "男性"]
        female_indicators = ["她", "她的", "她是", "女人", "女性"]
        
        has_male = any(ind in data.description for ind in gender_indicators)
        has_female = any(ind in data.description for ind in female_indicators)
        
        # 如果同时出现两种性别指示词，可能不一致
        if has_male and has_female:
            score -= 3
        
        # 检查场景和描述的一致性
        if data.scenario and data.description:
            # 如果场景提到"咖啡馆"但描述说"在森林中生活"，可能不一致
            # 这里做简单检查，实际需要更复杂的语义分析
            pass
        
        return max(0, score)
    
    def _score_rp_playability(self, data: TavernCardData) -> int:
        """
        评分：角色扮演实用性与沉浸感 (0-20)
        
        检查：
        - first_mes 是否能开启场景并邀请用户参与
        - mes_example 是否展示角色的语音风格
        - 是否使用 {{char}} 和 {{user}} 占位符
        """
        score = 20
        
        # 检查 first_mes
        if data.first_mes:
            first_len = len(data.first_mes)
            if first_len < 50:
                score -= 5
            elif first_len > 2000:
                score -= 3
            
            # 检查是否使用 {{user}}
            if "{{user}}" not in data.first_mes:
                score -= 3
            
            # 检查是否过于通用
            generic_greetings = ["你好", "嗨", "嗨，你好", "你好，我是"]
            if data.first_mes.strip() in generic_greetings:
                score -= 5
        
        # 检查 mes_example
        if data.mes_example:
            if "<START>" not in data.mes_example:
                score -= 5
            
            # 检查是否使用 {{char}} 和 {{user}}
            if "{{char}}" not in data.mes_example:
                score -= 3
            if "{{user}}" not in data.mes_example:
                score -= 3
        else:
            score -= 5  # 缺少 mes_example
        
        # 检查 scenario
        if not data.scenario or not data.scenario.strip():
            score -= 3
        
        return max(0, score)
    
    def _score_creativity(self, data: TavernCardData) -> int:
        """
        评分：创意与原创性 (0-20)
        
        检查：
        - 是否有新颖的想法
        - 是否避免刻板印象
        """
        score = 20
        
        # 检查刻板印象
        cliches = [
            "普通的年轻人",
            "普通的女孩",
            "普通的男孩",
            "神秘的人",
            "未知的人",
        ]
        
        if any(c in data.description for c in cliches):
            score -= 3
        
        # 检查是否有独特的特征
        unique_indicators = [
            "独特", "特别", "罕见", "稀有", "不寻常",
            "与众不同", "独一无二", "特殊能力", "特殊经历"
        ]
        
        if any(ind in data.description or ind in data.personality for ind in unique_indicators):
            score += 2  # 奖励
        
        # 检查 tags 是否有创意
        if data.tags and len(data.tags) > 3:
            score += 1
        
        return max(0, min(20, score))
    
    def _score_polish(self, data: TavernCardData) -> int:
        """
        评分：打磨与技术清晰度 (0-20)
        
        检查：
        - 语法是否正确
        - 格式是否易读
        - 细节是否正确放置
        """
        score = 20
        
        # 检查 HTML 注释使用
        if data.first_mes and "<!--" in data.first_mes:
            score += 2  # 奖励使用 HTML 注释
        
        # 检查格式问题
        # 检查是否有连续的空行
        if data.description and "\n\n\n\n" in data.description:
            score -= 2
        
        # 检查是否有未闭合的括号
        for text in [data.description, data.personality, data.scenario]:
            if text:
                open_count = text.count("（") + text.count("(")
                close_count = text.count("）") + text.count(")")
                if open_count != close_count:
                    score -= 1
        
        # 检查是否有重复的句子
        if data.description:
            sentences = data.description.split("。")
            if len(sentences) != len(set(sentences)):
                score -= 2
        
        return max(0, score)
    
    def _score_alternate_greetings(self, data: TavernCardData) -> int:
        """
        评分：alternate_greetings 奖励分 (0-5)
        
        检查：
        - 是否有多样化、符合角色设定的 alternate_greetings
        - 是否能启动不同的语调/场景
        """
        if not data.alternate_greetings or len(data.alternate_greetings) == 0:
            return 0
        
        count = len(data.alternate_greetings)
        
        # 基础分：数量
        if count >= 5:
            base_score = 5
        elif count >= 3:
            base_score = 3
        elif count >= 1:
            base_score = 1
        else:
            return 0
        
        # 检查质量
        quality_score = 0
        
        for greeting in data.alternate_greetings:
            # 检查长度
            if len(greeting) >= 50:
                quality_score += 0.5
            
            # 检查是否使用 {{user}}
            if "{{user}}" in greeting:
                quality_score += 0.5
            
            # 检查是否使用 {{char}}
            if "{{char}}" in greeting:
                quality_score += 0.5
        
        return min(5, base_score + quality_score)
    
    def _sum_breakdown(self, breakdown: QualityScoreBreakdown) -> int:
        """计算总分"""
        total = (
            breakdown.field_appropriateness +
            breakdown.character_consistency +
            breakdown.rp_playability +
            breakdown.creativity +
            breakdown.polish +
            breakdown.alternate_greetings_bonus
        )
        return min(105, total)  # 最高105分
    
    def _generate_suggestions(self, data: TavernCardData, breakdown: QualityScoreBreakdown) -> list[str]:
        """生成改进建议"""
        suggestions = []
        
        # 字段适当性建议
        if breakdown.field_appropriateness < 15:
            if not data.first_mes or not data.first_mes.strip():
                suggestions.append("添加首条消息 (first_mes) 以开启角色扮演")
            if not data.mes_example or not data.mes_example.strip():
                suggestions.append("添加消息示例 (mes_example) 以展示角色的语音风格")
            if not data.scenario or not data.scenario.strip():
                suggestions.append("添加场景设定 (scenario) 以框架化角色扮演情境")
        
        # 角色一致性建议
        if breakdown.character_consistency < 15:
            suggestions.append("确保描述、性格、场景和首条消息描述同一个角色")
            if data.first_mes and "{{char}}" not in data.first_mes:
                suggestions.append("在首条消息中使用 {{char}} 占位符")
        
        # 角色扮演实用性建议
        if breakdown.rp_playability < 15:
            if data.first_mes and "{{user}}" not in data.first_mes:
                suggestions.append("在首条消息中使用 {{user}} 占位符以邀请用户参与")
            if data.mes_example and "<START>" not in data.mes_example:
                suggestions.append("在消息示例中使用 <START> 标签")
        
        # 创意建议
        if breakdown.creativity < 15:
            suggestions.append("添加更多独特的特征或背景故事以增加原创性")
        
        # 打磨建议
        if breakdown.polish < 15:
            suggestions.append("检查语法和格式，确保内容清晰易读")
        
        # alternate_greetings 建议
        if breakdown.alternate_greetings_bonus < 3:
            suggestions.append("添加备选开场白 (alternate_greetings) 以增加重玩价值")
        
        return suggestions[:5]  # 最多5条建议
    
    def _estimate_tokens(self, data: TavernCardData) -> TokenEstimate:
        """估算 Token 数量"""
        # 简单估算：中文字符约1.5 token，英文单词约1 token
        def estimate(text: str) -> int:
            if not text:
                return 0
            # 检测是否主要是中文
            chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
            total_chars = len(text)
            
            if chinese_chars / total_chars > 0.5:
                # 主要是中文
                return int(total_chars * 1.5)
            else:
                # 主要是英文
                words = len(text.split())
                return int(words * 1.3)
        
        return TokenEstimate(
            total=estimate(data.description) + estimate(data.personality) + 
                  estimate(data.scenario) + estimate(data.first_mes) + 
                  estimate(data.mes_example),
            description=estimate(data.description),
            personality=estimate(data.personality),
            scenario=estimate(data.scenario),
            first_mes=estimate(data.first_mes),
            mes_example=estimate(data.mes_example),
        )


def display_quality_score(score: QualityScore):
    """显示质量评分"""
    grade_colors = {
        "S": "bold green",
        "A": "bold cyan",
        "B": "bold blue",
        "C": "bold yellow",
        "D": "bold orange1",
        "F": "bold red",
    }
    
    color = grade_colors.get(score.grade.value, "white")
    
    console.print(f"\n[{color}]等级: {score.grade.value} ({score.score}/105)[/{color}]")
    
    # 显示明细
    console.print("\n[bold]评分明细:[/bold]")
    console.print(f"  字段适当性与结构: {score.breakdown.field_appropriateness}/20")
    console.print(f"  角色一致性与身份: {score.breakdown.character_consistency}/20")
    console.print(f"  角色扮演实用性: {score.breakdown.rp_playability}/20")
    console.print(f"  创意与原创性: {score.breakdown.creativity}/20")
    console.print(f"  打磨与技术清晰度: {score.breakdown.polish}/20")
    console.print(f"  备选问候语奖励: +{score.breakdown.alternate_greetings_bonus}/5")
    
    # 显示建议
    if score.suggestions:
        console.print("\n[bold yellow]改进建议:[/bold yellow]")
        for i, suggestion in enumerate(score.suggestions, 1):
            console.print(f"  {i}. {suggestion}")
    
    # 显示 Token 估算
    if score.token_estimate:
        console.print(f"\n[dim]Token 估算: {score.token_estimate.total}[/dim]")


def create_quality_scorer() -> QualityScorer:
    """创建质量评分器实例"""
    return QualityScorer()
