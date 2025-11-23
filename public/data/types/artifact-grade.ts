/**
 * 法器品级配置类型定义
 */

export interface ArtifactGrade {
  /** 品级唯一ID */
  id: string;
  /** 品阶：黄阶、地阶、玄阶、天阶、仙阶、神阶 */
  tier: string;
  /** 品质：下品、中品、上品 */
  quality: string;
  /** 星级（同阶星级相同） */
  star: number;
  /** 品级数值（用于品质排序，0-17） */
  value: number;
  /** 推荐攻击加成最小值 */
  attackBonusMin: number;
  /** 推荐攻击加成最大值 */
  attackBonusMax: number;
  /** 推荐生命加成最小值 */
  healthBonusMin: number;
  /** 推荐生命加成最大值 */
  healthBonusMax: number;
}

export interface ArtifactGradeConfig {
  description: string;
  baselineFor: string;
  grades: ArtifactGrade[];
}
