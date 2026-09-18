import { describe, expect, it, vi } from 'vitest'
import { createNetworkController } from './network-controller'

describe('createNetworkController', () => {
  it('référence un même exécutable pour plusieurs PID et ne le libère qu’au dernier', async () => {
    const transport = {
      blockPid: vi.fn().mockResolvedValue('C:\\Program Files\\Discord\\Discord.exe'),
      unblockPath: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const controller = createNetworkController(transport)

    const first = await controller.blockProcess(10, 'discord.exe')
    const second = await controller.blockProcess(11, 'discord.exe')
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    await controller.unblockProcess(first!)
    expect(transport.unblockPath).not.toHaveBeenCalled()
    await controller.unblockProcess(second!)
    expect(transport.unblockPath).toHaveBeenCalledOnce()
  })

  it('ferme le transport privilégié à l’arrêt définitif', async () => {
    const transport = {
      blockPid: vi.fn(),
      unblockPath: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const controller = createNetworkController(transport)
    await controller.stop()
    expect(transport.stop).toHaveBeenCalledOnce()
  })
})
