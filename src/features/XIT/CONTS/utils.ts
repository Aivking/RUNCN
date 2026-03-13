export function isFactionContract(contract: PrunApi.Contract) {
  return !!contract.partner.countryCode;
}

export function canAcceptContract(contract: PrunApi.Contract) {
  return contract.party === 'CUSTOMER' && contract.status === 'OPEN';
}

export function canPartnerAcceptContract(contract: PrunApi.Contract) {
  return contract.party === 'PROVIDER' && contract.status === 'OPEN';
}

export function isSelfCondition(contract: PrunApi.Contract, condition: PrunApi.ContractCondition) {
  return contract.party === condition.party;
}

export function isPartnerCondition(
  contract: PrunApi.Contract,
  condition: PrunApi.ContractCondition,
) {
  return contract.party !== condition.party;
}

export interface ContractTotals {
  receivable: number;
  payable: number;
  currency: string;
  hasMixedCurrency: boolean;
}

/**
 * 计算合同列表的应收应付总额
 * @param contracts 合同列表
 * @returns 统计结果，包含应收、应付、货币代码和是否混合货币的标志
 */
export function calculateContractTotals(contracts: PrunApi.Contract[]): ContractTotals {
  let receivable = 0;
  let payable = 0;
  let currency = '';
  let hasMixedCurrency = false;

  for (const contract of contracts) {
    for (const cond of contract.conditions) {
      // 只处理未完成的支付条件
      if (cond.type === 'PAYMENT' && cond.amount && cond.status !== 'FULFILLED') {
        // 检查货币一致性
        if (currency && cond.amount.currency !== currency) {
          hasMixedCurrency = true;
        } else if (!currency) {
          currency = cond.amount.currency;
        }

        // 根据条件方判断是应收还是应付
        if (cond.party !== contract.party) {
          receivable += cond.amount.amount;
        } else {
          payable += cond.amount.amount;
        }
      }
    }
  }

  return { receivable, payable, currency, hasMixedCurrency };
}

export function friendlyConditionText(type: PrunApi.ContractConditionType) {
  switch (type) {
    case 'BASE_CONSTRUCTION':
      return '建造基地';
    case 'COMEX_PURCHASE_PICKUP':
      return '材料提取';
    case 'CONSTRUCT_SHIP':
      return '建造飞船';
    case 'CONTRIBUTION':
      return '贡献';
    case 'DELIVERY':
      return '交付';
    case 'DELIVERY_SHIPMENT':
      return '交付货物';
    case 'EXPLORATION':
      return '探索';
    case 'FINISH_FLIGHT':
      return '完成飞行';
    case 'GATEWAY_FUEL':
      return '星门燃料';
    case 'HEADQUARTERS_UPGRADE':
      return '升级总部';
    case 'INFRASTRUCTURE_CONSTRUCTION_FINISH':
      return '基建建设完成';
    case 'INFRASTRUCTURE_CONSTRUCTION_START':
      return '基建建设开始';
    case 'INFRASTRUCTURE_UPGRADE_FINISH':
      return '基建升级完成';
    case 'INFRASTRUCTURE_UPGRADE_START':
      return '基建升级开始';
    case 'INFRASTRUCTURE_UPKEEP':
      return '基建维护';
    case 'LOAN_INSTALLMENT':
      return '贷款分期';
    case 'LOAN_PAYOUT':
      return '贷款发放';
    case 'PAYMENT':
      return '付款';
    case 'PICKUP':
      return '提取';
    case 'PICKUP_SHIPMENT':
      return '提取';
    case 'PLACE_ORDER':
      return '下单';
    case 'POWER':
      return '成为总督';
    case 'PRODUCTION_ORDER_COMPLETED':
      return '完成生产订单';
    case 'PRODUCTION_RUN':
      return '运行生产';
    case 'PROVISION':
      return '供应';
    case 'PROVISION_SHIPMENT':
      return '供应';
    case 'REPAIR_SHIP':
      return '修复飞船';
    case 'REPUTATION':
      return '声望';
    case 'START_FLIGHT':
      return '开始飞行';
    case 'WORKFORCE_PROGRAM_PAYMENT':
      return '劳动力付款';
    case 'WORKFORCE_PROGRAM_START':
      return '劳动力项目启动';
    default:
      return type;
  }
}
