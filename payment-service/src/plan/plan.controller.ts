import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { PlanService } from './plan.service';
import { Public } from '../common/decorators';
import { PlanType, PlanInterval } from '@prisma/client';

@Controller('/plans')
export class PlanController {
    constructor(private planService: PlanService) { }

    @Public()
    @Get()
    async getAllPlans() {
        return this.planService.getAllPlans();
    }

    @Public()
    @Get(':id')
    async getPlanById(@Param('id') id: string) {
        return this.planService.getPlanById(id);
    }

    @Post()
    async createPlan(@Body() data: any) {
        return this.planService.createPlan(data);
    }

    @Patch(':id')
    async updatePlan(@Param('id') id: string, @Body() data: any) {
        return this.planService.updatePlan(id, data);
    }

    @Patch(':id/deactivate')
    async deactivatePlan(@Param('id') id: string) {
        return this.planService.deactivatePlan(id);
    }
}
