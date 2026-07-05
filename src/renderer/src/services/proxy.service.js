import { ipcService } from './ipc.service';
import {
    countUnsupportedXrayInsecureLinks,
    decodeBase64Content,
    getProxyRemark,
    uuidv4
} from '../utils/helpers';

/**
 * 代理与订阅服务 - 处理节点测试、订阅同步与数据解析
 */
export const proxyService = {
    /**
     * 测试单个节点的延迟
     */
    async testLatency(url) {
        try {
            const res = await ipcService.invoke('test-proxy-latency', url);
            return {
                success: res.success,
                latency: res.success ? res.latency : -1,
                error: res.success ? '' : (res.msg || 'Fail')
            };
        } catch (error) {
            return { success: false, latency: -1, error: error.message || 'Error' };
        }
    },

    /**
     * 批量测试节点延迟
     */
    async testBatchLatency(nodes) {
        try {
            return await ipcService.invoke(
                'test-proxy-latency-batch',
                nodes.map((p) => ({ id: p.id, url: p.url }))
            );
        } catch (error) {
            const promises = nodes.map(async (p) => {
                const res = await this.testLatency(p.url);
                return { id: p.id, ...res };
            });
            return await Promise.all(promises);
        }
    },

    /**
     * 同步订阅节点
     */
    async syncSubscription(sub) {
        try {
            const content = await ipcService.invoke('fetch-url', sub.url);
            let decoded = content;
            
            // 尝试处理 Base64 编码的订阅内容
            try { 
                if (!content.includes('://')) {
                    decoded = decodeBase64Content(content);
                }
            } catch (e) {
                console.warn('[Proxy Service] Base64 decode failed, using raw content');
            }

            const lines = decoded.split(/[\r\n]+/);
            const newNodes = [];
            let count = 0;
            let unsupportedInsecureCount = 0;

            lines.forEach(line => {
                line = line.trim();
                if (line && line.includes('://')) {
                    unsupportedInsecureCount += countUnsupportedXrayInsecureLinks([line]);
                    const remark = getProxyRemark(line) || `Node ${count + 1}`;
                    newNodes.push({
                        id: uuidv4(),
                        remark,
                        url: line,
                        enable: true,
                        groupId: sub.id
                    });
                    count++;
                }
            });

            return { success: true, count, nodes: newNodes, unsupportedInsecureCount };
        } catch (error) {
            console.error('[Proxy Service] Sync failed:', error);
            return { success: false, error: error.message || 'Update failed' };
        }
    },

    /**
     * 保存代理设置
     */
    async saveSettings(settings) {
        return await ipcService.saveSettings(settings);
    }
};
